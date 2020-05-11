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

/*
 *-------------------------------------------------------
 * LIST ALL USERS
 *-------------------------------------------------------
 * 
 */
app.get('/', (req: express.Request, res: express.Response) => {
    
    const CC = new CloudCore(req);

    let limit: any = req.query.limit;
    if (isNaN(limit)) limit = 100;

    if (limit > 999) {
        res.status(400).json({'error': 'You cannot fetch more than 1000 users at one query.'}).end();
        return;
    }

    const nextPageToken: any = !req.query.next ? undefined : req.query.next;

    CC.init().then(async () => {
        
        if (!CC.can('get_user')) {
            res.status(400).json({'error': 'You are not allowed to access this route.'}).end();
            return;
        }

        let result: Object[] = [];

        auth.listUsers(limit, nextPageToken)
        .then((listUsersResult) => {
            
            listUsersResult.users.forEach((userRecord) => {
                result.push(userRecord.toJSON());
            });

            res.status(200).json({nextPageToken: nextPageToken, data: result}).end();

        }).catch((error) => {
            res.status(404).json({'error': error}).end();
            return;
        });

    }).catch(error => {
        res.status(400).json({'error': error}).end();
        return;
    })

});

/*-------------------------------------------------------*
 * EXPORT
 *-------------------------------------------------------*/
export const users = functions.https.onRequest(app);