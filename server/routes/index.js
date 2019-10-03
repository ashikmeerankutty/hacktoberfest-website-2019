const express = require('express');

const router = express.Router();
const path = require('path');
const { catchErrors } = require('../handlers/errorHandlers');
const appController = require('../controllers/appController');
const api = require('./api');

router.get('/', appController.getIndex);

router.get('/api/v1/', api.sendStatus);

// add body validator
router.post('/api/v1/getPullRequestsData', catchErrors(api.fetchGitHubData));

router.get('/api/v1/getHacktoberfestRepos', catchErrors(api.fetchGetHacktoberfestRepos));

if (process.env.NODE_ENV === 'production') {
    // Handles any requests that don't match the ones above
    router.get('*', (req, res) => {
        res.sendFile(path.join(`${__dirname}/../../client/build/index.html`));
    });
}

module.exports = router;
