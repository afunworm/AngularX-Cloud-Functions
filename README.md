# AngularX Cloud Functions
Cloud Functions dependency for [AngularX](https://github.com/afunworm/AngularX).

# Installation
1. From the root folder:

    $ npm install -g firebase-tools

    $ npm install firebase-functions@latest firebase-admin@latest --save

    $ npm install install

2. From the `functions` folder:

    $ npm install

    $ tsc install && node install

3. Make sure Cloud Functions is enabled from your Firebase Console.
4. Configure `functions/environment/environment.json` by copying `environment.sample.json`
5. From the `angularx-cloud-functions` folder:

    $ firebase deploy