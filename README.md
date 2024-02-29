# qis-grade-notification

## Run project
1. Install dependencies with `yarn install`. 
2. Compile ts to js with `yarn tsc`.
3. Create the `.env` file as below.
    ```
    TELEGRAM_BOT_SECRET=<bot-secret>
    QIS_USERNAME=<username>
    QIS_PASSWORD=<password>
    PRIVATE_USER_ID=<user-id of user who gets the actuall grade and additional information like logging>
    ````
1. Run the node application with `node --env-file=.env built/index.js`

## Development
`yarn tsc && node --env-file=.env built/index.js`