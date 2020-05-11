/*-------------------------------------------------------*
 * LIBRARIES
 *-------------------------------------------------------*/
import * as functions from 'firebase-functions';
import * as express from 'express';
import * as admin from 'firebase-admin';
import CloudCore from '../CloudCore';

/*-------------------------------------------------------*
 * FIREBASE ADMIN
 *-------------------------------------------------------*/
const environment = require('../../environments/environment.json');
if (admin.apps.length === 0) {
    
    admin.initializeApp({
        credential: admin.credential.cert(require('../' + environment.serviceAccount)),
        databaseURL: environment.databaseURL
    });

}
const db = admin.firestore();
const auth = admin.auth();

/*-------------------------------------------------------*
 * EXPRESS
 *-------------------------------------------------------*/
const app = express();
app.use(express.urlencoded()); //Parse URL-encoded bodies (as sent by HTML forms)
app.use(express.json()); //Parse JSON bodies (as sent by API clients)
app.use(function(req, res, next) {
    res.header('Access-Control-Allow-Origin', '*');
    res.header("Access-Control-Allow-Methods", "GET,HEAD,OPTIONS,POST,PUT,PATCH,DELETE");
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    next();
});

/*
 *-------------------------------------------------------
 * DEPENDENCIES
 *-------------------------------------------------------
 * All functions required for this route
 */

/*
 *-------------------------------------------------------
 * ROUTE LOGICS
 *-------------------------------------------------------
 * All the route logics should be in this section below
 */
function formatPhone(input:(number | string)):string {

    if (input === undefined || input === null || !input) return '';

    let phone = input.toString().replace(/\D/g, '');
    
    if (phone.length === 11 && phone.startsWith('1')) phone = phone.substr(1);

    if (phone.length !== 10) return '';

    return `+1${phone}`;

}

function isEmail(input: string): boolean {
    const regexp = /^(?=.{1,254}$)(?=.{1,64}@)[-!#$%&'*+/0-9=?A-Z^_`a-z{|}~]+(\.[-!#$%&'*+/0-9=?A-Z^_`a-z{|}~]+)*@[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$/;
    return regexp.test(input);
}

 /*
 *-------------------------------------------------------
 * CREATE A USER
 *-------------------------------------------------------
 * 
 */
interface CreateUser {
    email?: string,
    emailVerified: boolean,
    password: string,
    displayName: string,
    photoURL?: string,
    disabled: boolean,
    phoneNumber?: string
}
app.post('/', (req: express.Request, res: express.Response) => {

    const CC = new CloudCore(req, false);

    let email = req.body.email;
    let phoneNumber = req.body.phoneNumber;
    let emailVerified = false;
    let password = req.body.password;
    let displayName = req.body.displayName;
    let photoURL = !req.body.photoURL ? '' : req.body.photoURL;
    let disabled = false;

    if (!email && !phoneNumber) {
        res.status(400).json({'error': 'Either email and phone number must be provided.'}).end();
        return;
    }

    if (!isEmail(email) && formatPhone(phoneNumber) === '') {
        res.status(400).json({'error': 'A valid email or phone number must be provided.'}).end();
        return;
    }

    email = isEmail(email) ? email : null;
    displayName = displayName ? displayName : '';

    function isStandardField(fieldName: string) {
        return ['displayName', 'email', 'phoneNumber', 'password', 'emailVerified', 'disabled', 'photoURL'].includes(fieldName);
    }

    let data: CreateUser = {
        emailVerified: emailVerified,
        password: password,
        displayName: displayName,
        disabled: disabled
    }

    if (photoURL.toString().toLowerCase().startsWith('http:') || photoURL.toString().toLowerCase().startsWith('https:'))
        data.photoURL = photoURL;
    if (formatPhone(phoneNumber) !== '') data.phoneNumber = formatPhone(phoneNumber);
    if (isEmail(email)) data.email = email;

    CC.init().then(async () => {

        //If allowSignUp is false AND the user doesn't have the permission to create users
        if (!environment.allowSignUp && !CC.can('create_user')) {
            res.status(400).json({'error': 'You are not allowed to create users. Signup mode is disabled.'}).end();
            return;
        }

        try {

            //Create user in auth
            let userRecord = await auth.createUser(data);

            //Extra data
            let extraData: any = {};
            for (let key in req.body) {
                if (!isStandardField(key) && key !== 'permissions') //Permissions cannot be overwritten
                    extraData[key] = req.body[key];
            }
            if (Object.keys(extraData).length > 0) {

                //DOB must be handled differently
                //Date.parse(invalid) will return null, type is also null
                if (extraData.dob && !Date.parse(extraData.dob)) {
                    res.status(400).json({'error': 'DOB must be a valid Date.'}).end();
                    return;
                }
                if (req.body.dob && Date.parse(req.body.dob)) {
                    extraData.dob = admin.firestore.Timestamp.fromDate(new Date(Date.parse(extraData.dob)));
                } else {
                    extraData.dob = null;
                }

                db.collection('Users').doc(userRecord.uid).set(extraData, {merge: true}) //Set merge to true to prevent conflicts from background functions
                .catch(error => {
                    res.status(400).json({'error': error}).end();
                    return;
                });
            }

            res.status(200).json({data: userRecord}).end();

        } catch (error) {
            res.status(400).json({'error': error}).end();
            return;
        }

    }).catch(error => {
        res.status(400).json({'error': error}).end();
        return;
    })

});

/*
 *-------------------------------------------------------
 * GET A USER INFO
 *-------------------------------------------------------
 * 
 */
app.get('/:uid', (req: express.Request, res: express.Response) => {

    const CC = new CloudCore(req);
    const uid = req.params.uid;

    CC.init().then(async () => {
        
        //A user can get their own info
        if (!CC.can('get_user') && uid !== CC.uid) {
            res.status(400).json({'error': 'You are not allowed to access this route.'}).end();
            return;
        }

        try {
            
            let data = await db.collection('Users').doc(uid).get();
            let authData = await auth.getUser(uid);

            if (data.exists) {
                res.status(200).json({'data': data.data(), 'authData': authData}).end();
                return;
            } else {
                res.status(404).json({'error': `Unable to retrieve user ${uid}.`}).end();
                return;
            }

        } catch (error) {
            res.status(404).json({'error': error}).end();
            return;
        }

    }).catch(error => {
        res.status(400).json({'error': error}).end();
        return;
    })

});

/*
 *-------------------------------------------------------
 * UPDATE A USER INFO
 *-------------------------------------------------------
 * 
 */
app.patch('/:uid', (req: express.Request, res: express.Response) => {

    const CC = new CloudCore(req);
    const uid = req.params.uid;
    const data = req.body;

    CC.init().then(async () => {
        
        //A user can update their own info
        if (!CC.can('edit_user') && uid !== CC.uid) {
            res.status(400).json({'error': 'You are not allowed to edit this user.'}).end();
            return;
        }

        //Permissions cannot be updated through regular update
        //@TODO Update Permission Functions
        if ('permissions' in req.body) delete data['permissions'];

        //DOB must be handled differently
        //Date.parse(invalid) will return null, type is also null
        if (data.dob && !Date.parse(data.dob)) {
            res.status(400).json({'error': 'DOB must be a valid Date.'}).end();
            return;
        }
        if (data.dob && Date.parse(data.dob)) {
            req.body.dob = admin.firestore.Timestamp.fromDate(new Date(Date.parse(data.dob)));
        } else {
            data.dob = null;
        }
        
        try {
            await db.collection('Users').doc(uid).set(data, {merge: true});
            res.status(200).json({ data: `User ${uid} has been updated successfully.` }).end();
        } catch (error) {
            res.status(400).json({'error': error}).end();
        }


    }).catch(error => {
        res.status(400).json({'error': error}).end();
        return;
    })

});

/*
 *-------------------------------------------------------
 * UPDATE A USER CUSTOM INFO
 *-------------------------------------------------------
 * 
 */
interface CustomDataRequest {
    key: string,
    value: any,
    type: string
}
function processCustomData(customData: CustomDataRequest[]) {
    let result: { [name: string]: any } = {};
    customData.forEach(data =>  {

        let key = data.key, value = data.value, type = data.type;
        if (!('key' in data && 'value' in data && 'type' in data)) return;
        
        if (type === 'string') {

            if (value === null) result[key] = 'null';
            else if (value === undefined) result[key] = 'undefined';
            else result[key] = value.toString();

        } else if (type === 'number') {

            //Number, number string, boolean and null is consider !isNaN()
            //The only valid values are number and number string
            if (!isNaN(value) && typeof value !== 'boolean' && value !== null)
                result[key] = Number(value);
            else
                result[key] = `[INVALID] ${value} is not a number`;

        } else if (type === 'boolean') {
            result[key] = !!value;
        } else if (type === 'timestamp') {
            if (value) {
                if (!Date.parse(value)) result[key] = `[INVALID] ${value} is not a timestamp`;
                else result[key] = admin.firestore.Timestamp.fromDate(new Date(Date.parse(value)));
            } else {
                result[key] = `[INVALID] ${value} is not a timestamp`;
            }
        } else if (type === 'null' || type === null) {
            result[key] = null;
        } else if (type === 'delete') {
            result[key] = admin.firestore.FieldValue.delete();
        } else {
            result[key] = `[INVALID] Type ${type} is not supported for value ${value}`;
        }
    });

    return result;
}
app.patch('/:uid/custom', (req: express.Request, res: express.Response) => {

    const CC = new CloudCore(req);
    const uid = req.params.uid;
    let data = req.body.data;

    if (!data){
        res.status(400).json({'error': 'Data is required to update user.'}).end();
        return;
    }

    CC.init().then(async () => {
        
        //A user can update their own info
        if (!CC.can('edit_user') && uid !== CC.uid) {
            res.status(400).json({'error': 'You are not allowed to edit this user.'}).end();
            return;
        }

        //Permissions cannot be updated through regular update
        //@TODO Update Permission Functions
        if ('permissions' in req.body) delete data['permissions'];

        //Process data
        data = processCustomData(data);
        
        try {
            await db.collection('Users').doc(uid).set(data, {merge: true});
            res.status(200).json({ data: `User ${uid} has been updated successfully.` }).end();
        } catch (error) {
            res.status(400).json({'error': error}).end();
        }


    }).catch(error => {
        res.status(400).json({'error': error}).end();
        return;
    })

});

/*
 *-------------------------------------------------------
 * DELETE A USER
 *-------------------------------------------------------
 * 
 */
app.delete('/:uid', (req: express.Request, res: express.Response) => {

    const CC = new CloudCore(req);
    const uid = req.params.uid;

    CC.init().then(async () => {
        
        if (!CC.can('delete_user')) {
            res.status(400).json({'error': 'You are not allowed to delete users.'}).end();
            return;
        }
        
        try {
            await auth.deleteUser(uid);
            res.status(200).json({ data: `User ${uid} has been deleted successfully.` }).end();

        } catch (error) {
            res.status(400).json({'error': error}).end();
        }


    }).catch(error => {
        res.status(400).json({'error': error}).end();
        return;
    })

});

app.post('/test', (req: express.Request, res: express.Response) => {

    res.status(200).json({
        'data': req.body,
        'type': (typeof req.body.date),
        'converted': Date.parse(req.body.date),
        'convertedType': (typeof Date.parse(req.body.date)),
        'randomWrong': Date.parse('2020/19/18')
    }).end();

});

/*-------------------------------------------------------*
 * EXPORT
 *-------------------------------------------------------*/
export const user = functions.https.onRequest(app);