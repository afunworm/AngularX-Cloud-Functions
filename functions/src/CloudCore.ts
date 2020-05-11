import * as admin from 'firebase-admin';

const environment = require('../environments/environment.json');
if (admin.apps.length === 0) {
    
    admin.initializeApp({
        credential: admin.credential.cert(require('../' + environment.serviceAccount)),
        databaseURL: environment.databaseURL
    });

}

interface User {
    "displayName": string,
    "firstName": string,
    "phoneNumber": string,
    "dob": boolean | Date,
    "permissions": {
        "create_user": boolean,
        "get_user": boolean,
        "delete_user": boolean,
        "manage_options": boolean,
        "edit_user": boolean,
        [key: string]: boolean
    },
    "email": string,
    "photoURL": string,
    "lastName": string
}

export default class CloudCore {

    public token: string;
    public user!: User;
    public uid: string = '';
    public logs: string[] = [];
    private requireAuthentication: boolean = true;

    constructor(req: any, requireAuthentication: boolean = true) {

        //Extract token
        this.token = this.extractToken(req);

        //Does the function require authentication? Example: Sign up might not, but delete user might
        this.requireAuthentication = !!requireAuthentication;

    }

    //Is this user the admin of the app?
    isAdmin(): boolean {
        console.log(`Comparing ${this.uid} and ${environment.admin}`);
        return this.uid === environment.admin;
    }

    //Convert token or header to bearer token
    extractToken(input: any): string {
        if (typeof input.get === 'function') {

            const authHeader = input.get('Authorization');

            this.log(authHeader);

            if (!authHeader) return '';

            const parts = authHeader.split(' ');

            if (parts.length === 2 && parts[0] === 'Bearer')
                return parts[1];
            else
                return '';

        } else if (typeof input === 'string')
            return input;

        return '';
    }
    
    log(log: any) {
        this.logs.push(log);
    }

    //Verify and get the requester's user's data
    init() {
        
        return new Promise(async (resolve, reject) => {

            if (this.token === '') {

                if (this.requireAuthentication) {
                    //No token AND requires authentication
                    reject({message: 'Invalid authorization token.', headers: this.logs});
                    return;
                } else {
                    //No token AND does not require authentication
                    resolve();
                    return;
                }
                
            }

            try {

                const decodedToken = await admin.auth().verifyIdToken(this.token);
                const uid = decodedToken.uid;
                const snapshot = await admin.firestore().collection('Users').doc(uid).get();

                if (snapshot.exists) {
                    this.user = snapshot.data() as User;
                    this.uid = uid;
                    resolve(this.user);
                    return;
                } else {
                    reject('Document does not exist.');
                    return;
                }
                
            } catch (error) {
                reject({code: error.code, message: error.message});
                return;
            }
            

        });

    }

    //Check if the requester has the appropriate permission
    can(permission: string): boolean {
        
        //Admin can do anything
        if (this.isAdmin()) return true;

        //If no authentication is required and the token is empty, there's no permission
        if (!this.requireAuthentication && this.token === '') return false;

        //Otherwise, check for permission and return the boolean value
        return !!this.user.permissions[permission];

    }

}