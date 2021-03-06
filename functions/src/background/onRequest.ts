/*-------------------------------------------------------*
 * LIBRARIES
 *-------------------------------------------------------*/
import * as functions from 'firebase-functions';
import * as express from 'express';
import * as admin from 'firebase-admin';

/*-------------------------------------------------------*
 * FIREBASE ADMIN
 *-------------------------------------------------------*/
const environment = require('../../environments/environment.json');
if (admin.apps.length === 0) {
    
    admin.initializeApp({
        credential: admin.credential.cert(require('../' + environment.serviceAccount)),
        databaseURL: environment.databaseURL,
        storageBucket: environment.storageBucket
    });

}
const db = admin.firestore();
const auth = admin.auth();
const storage = admin.storage();

/*-------------------------------------------------------*
 * EXPRESS
 *-------------------------------------------------------*/
const app = express();
app.use(express.urlencoded()); //Parse URL-encoded bodies (as sent by HTML forms)
app.use(express.json()); //Parse JSON bodies (as sent by API clients)
app.use(function(req, res, next) {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    next();
});

/*
 *-------------------------------------------------------
 * DEPENDENCIES
 *-------------------------------------------------------
 * All functions required for this route
 */
function extractName(name: string) {

    if (name.indexOf(' ') === -1) return { firstName: name, lastName: '' };

    return {
        firstName: name.split(' ').slice(0, -1).join(' '),
        lastName: name.split(' ').slice(-1).join(' ')
    }

}

function formatPhone(input:(number | string)):string {

    if (input === undefined || input === null || !input) return '';

    let phone = input.toString().replace(/\D/g, '');
    
    if (phone.length === 11 && phone.startsWith('1')) phone = phone.substr(1);

    if (phone.length !== 10) return '';

    return `+1${phone}`;

}

/*
 *-------------------------------------------------------
 * ROUTE LOGICS
 *-------------------------------------------------------
 * All the route logics should be in this section below
 */
/*-------------------------------------------------------
 * ON USER CREATE
 *-------------------------------------------------------
 * Create necessary fields for user in System.Users when
 * an account is created
 */
exports.onUserCreate = functions.auth.user().onCreate((user) => {

    if (!user.displayName) user.displayName = '';

    return Promise.all([

        (() => {

            return db.collection('Users').doc(user.uid).set({
                email: user.email,
                displayName: user.displayName,
                firstName: extractName(user.displayName).firstName,
                lastName: extractName(user.displayName).lastName,
                dob: null,
                photoURL: user.photoURL,
                phoneNumber: user.phoneNumber,
                permissions: {
                    create_user: false,
                    delete_user: false,
                    edit_user: false,
                    get_user: false,
                    manage_options: false
                }
            }, {merge: true}); //Set merge to true in case the document already existed

        })(),

        (() => {
            return db.collection('Users').doc('@info').update({
                totalAccounts: admin.firestore.FieldValue.increment(1)
            });
        })()

    ]);

});

/*-------------------------------------------------------
 * ON USER DELETE
 *-------------------------------------------------------
 * Remove user from Firestore when user is removed
 * from authentication database
 */
exports.onUserDelete = functions.auth.user().onDelete((user) => {
    
    return Promise.all([

        (() => {
            return db.collection('Users').doc(user.uid).delete();
        })(),

        (() => {
            return db.collection('Users').doc('@info').update({
                totalAccounts: admin.firestore.FieldValue.increment(-1)
            });
        })()

    ]);

});

/*-------------------------------------------------------
 * ON USER DATA UPDATE FROM FIRESTORE
 *-------------------------------------------------------
 * Update user database (authentication) when user's
 * Firestore database is updated
 */
interface AuthData {
    email?: string,
    phoneNumber?: string | null,
    displayName?: string,
    photoURL?: string | null
}
exports.onUserFirestoreUpdate = functions.firestore.document('Users/{userId}').onUpdate(async (change, context) => { 

    const userId = context.params.userId;
    const newValue: any = change.after.data();
    const oldValue: any = change.before.data();

    if (newValue === oldValue) return;

    let data: AuthData = {
        email: newValue.email,
        phoneNumber: formatPhone(newValue.phoneNumber),
        displayName: newValue.displayName
    };

    if (newValue.photoURL !== null) {

        if (newValue.photoURL.toString().toLowerCase().startsWith('http:') || newValue.photoURL.toString().toLowerCase().startsWith('https:'))
            data.photoURL = newValue.photoURL;
        else {
            data.photoURL = null;
        }

    }
    
    return auth.updateUser(userId, data);

});

/*-------------------------------------------------------
 * ON OBJECT UPLOADED TO STORAGE
 *-------------------------------------------------------
 * Extract custom metadata and create a reference doc
 * in Firestore whenever an object is uploaded to the
 * storage.
 */
exports.onObjectAdded = functions.storage.object().onFinalize(async (object) => {

    const bucket = storage.bucket();
    const file = bucket.file(object.name as string);

    // Get a signed URL for the file
    return file.getSignedUrl({ action: 'read', expires: '12-31-3011' }).then(result => {

        const url = result[0];
        let metadata = object.metadata ? object.metadata : {};

        //Set privacy
        if (!('privacy' in metadata)) metadata.privacy = 'private';

        let data = {
            ...metadata, //Come first so other details can be overwritten
            path: object.name,
            extension: (object.name as string).split('.').pop(),
            downloadUrl: url,
            contentType: object.contentType,
            size: Number(object.size),
            _createdAt: admin.firestore.Timestamp.fromDate(new Date(object.timeCreated))
        };

        //Add data to Firestore
        if (object.metadata?.fileId) {
            db.collection('Storage').doc(object.metadata.fileId).set(data).catch(error => console.log(error));
        } else {
            db.collection('Storage').add(data).catch(error => console.log(error));
        }
    });

});


/*-------------------------------------------------------
 * ON OBJECT DELETED FROM STORAGE
 *-------------------------------------------------------
 * Remove data from Firestore whenever an object is 
 * removed from storage
 */
exports.onObjectDeleted = functions.storage.object().onDelete(async (object) => {

    if (object.metadata?.fileId) {
        return db.collection('Storage').doc(object.metadata?.fileId).delete().catch(error => console.log(error));
    }

    return;

});


/*-------------------------------------------------------
 * ON STORAGE ENTRY DELETE FROM FIRESTORE
 *-------------------------------------------------------
 * Remove corresponding object from storage when its
 * entry is removed from Firestore
 */
exports.onUserFirestoreUpdate = functions.firestore.document('Storage/{fileId}').onDelete(async (snap, context) => { 

    const deletedValue = snap.data() as any;
    const bucket = storage.bucket();
    const name = deletedValue.name;

    return bucket.file(name).delete();

});