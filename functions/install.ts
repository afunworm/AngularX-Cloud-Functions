import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as chalk from 'chalk';
import * as fs from 'fs';

//Prerequisite - Does environment.js exist?
if (!fs.existsSync('./environments/environment.json')) {
    console.log(`Unable to find ${chalk.cyan('/functions/environments/environment.json')}.`);
    console.log(`To set up your ${chalk.cyan('environment.js')}, copy and configure ${chalk.cyan('/functions/environment/environment.sample.js')}.`);
    process.exit();
}

const environment = require('./environments/environment.json');

if (admin.apps.length === 0) {
    
    console.log('Initializing Firebase Admin');
    admin.initializeApp({
        credential: admin.credential.cert(require('./' + environment.serviceAccount)),
        databaseURL: environment.databaseURL,
        storageBucket: environment.storageBucket
    });
    console.log(`${chalk.greenBright('Done')}`);

}

const skipDBCheck = true;
const db = admin.firestore();
const auth = admin.auth();
const storage = admin.storage();

//Prerequisite - Is environment.admin set?
if (!environment.admin || typeof environment.admin !== 'string') {
    console.log(`${chalk.cyan('admin')} must be configured inside your environment.js with the admin's UID`);
    console.log(`Please check your configuation for ${chalk.cyan('/functions/environments/environment.json')}`);
    process.exit();
}

//Prerequisite - Is Firebase Storage set up?
console.log('Initializing Firebase Cloud Storage');
let bucket = storage.bucket();
if (!bucket.exists) {
    console.log(`${chalk.red('Unable to create Firesbase Cloud Storage')}`);
    console.log(`${chalk.red('Please make sure you have enabled Cloud Storage from the Firebase Console')}`);
    process.exit();
} else {
    console.log(`${chalk.greenBright('Done')}`);
}

function extractName(name: string) {

    if (name === undefined || name === null) return { firstName: '', lastName: '' };

    if (name.indexOf(' ') == -1) return { firstName: name, lastName: '' };

    return {
        firstName: name.split(' ').slice(0, -1).join(' '),
        lastName: name.split(' ').slice(-1).join(' ')
    }

}

//Prerequisite - Is Firestore Users empty?
console.log('Initialzing Firebase Firestore');
db.listCollections()
.then(collections => {

    if (collections.length !== 0 && !skipDBCheck) {
        console.log(`${chalk.red('Unable to initialize Firebase Firestore. An empty Firestore database is required for the installation')}`);
        process.exit();
    } else {
        console.log(`${chalk.greenBright('Done')}`);
    }

    //Prerequisite - Is the UID provided correct?
    console.log('Checking if admin user exists in Firebase Authentication');
    let adminId = environment.admin;
    admin.auth().getUser(adminId).then(async (user) => {
        
        //Set up the basic Users in the database
        await db.collection('Users').doc(adminId).set({
            email: user.email,
            displayName: user.displayName || '',
            firstName: extractName(user.displayName || '').firstName,
            lastName: extractName(user.displayName || '').lastName,
            dob: false,
            photoURL: user.photoURL || '',
            phoneNumber: user.phoneNumber || '',
            permissions: {
                create_user: true,
                delete_user: true,
                edit_user: true,
                get_user: true,
                manage_options: true
            }
        }).catch(error => {
            console.log(`${chalk.red('Unable to sync admin data to Firebase Firestore')}`);
            console.log(error);
            process.exit();
        });

        console.log(`${chalk.greenBright('Done')}`);
        console.log(`Setting up additional info for AngularX Cloud Functions`);
        
        //Set up the basic denormalization of users
        let info = { totalAccount: 1 };
        await db.collection('Users').doc('@info').set(info).catch(error => {
            console.log(`${chalk.red('Error encountered while installing AngularX Cloud Functions')}.`);
            console.log(error);
            process.exit();
        }).catch(error => {
            console.log(`${chalk.red('Unable to set up additional data in Firebase Firestore')}`);
            console.log(error);
        });

        console.log(`${chalk.greenBright('AngularX Cloud Functions completed successfully')}`);
        process.exit();

    }).catch(error => {
        console.log(`${chalk.red('Admin user id')} ${chalk.cyan(adminId)} ${chalk.red('does not exist in your Firebase Authentication')}`);
        console.log(`${chalk.red('Please provide an existing admin user UID in your')} ${chalk.cyan('/functions/environments/environment.json')}`);
        console.log(error);
        process.exit();
    });

}).catch(error => {
    //Is the credential provided correct?
    console.log(`${chalk.red('Unable to connect to Firestore')}`);
    console.log(`${chalk.red('Please make sure your Service Account\'s filename is properly configured under')} ${chalk.cyan('/functions/environments/environment.json')}`);
    console.log(error);
    process.exit();
});