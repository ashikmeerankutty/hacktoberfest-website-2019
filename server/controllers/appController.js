/* eslint-disable camelcase */
const _ = require('lodash');
const moment = require('moment');

exports.getIndex = (req, res) => {
    res.json({ status: '200' });
};

const buildSearchQuery = (username, searchYear) => {
    return `-label:invalid+created:${searchYear}-09-30T00:00:00-12:00..${searchYear}-10-31T23:59:59-12:00+type:pr+is:public+author:${username}`;
};

const loadPRs = async ({ username, octokit }) => {
    /**
     *  Get correct-year
     */
    const today = new Date();
    const currentYear = today.getFullYear();
    const searchYear = today.getMonth() < 9 ? currentYear - 1 : currentYear;

    let list = [];
    let userExists = true;

    try {
        list = await octokit.search.issuesAndPullRequests({
            q: buildSearchQuery(username, searchYear),
            per_page: 100,
        });
    } catch (err) {
        // Handle NoSuchUser error
        userExists = false;
    }

    if (userExists) {
        /**
         *  Paginate through all the pages
         */
        list = await octokit.paginate(list);
    }

    return { list };
};

const parsePRs = ({ list }) => {
    return _.map(list, item => {
        const { pull_request, labels, number, state, title, html_url, user, created_at } = item;

        // Extract repo name
        const repo = pull_request.html_url.substring(0, pull_request.html_url.search('/pull/'));

        const hasHacktoberfestLabel = _.some(labels, label => {
            return label.name.toLowerCase() === 'hacktoberfest';
        });

        // The 7 day time offered by DigitalOcean
        const weekOld = moment()
            .subtract(7, 'days')
            .startOf('day');

        return {
            title,
            number,
            repoName: repo.replace('https://github.com/', ''),
            user: {
                login: user.login,
                url: user.html_url,
            },
            url: html_url,
            open: state === 'open',
            hasHacktoberfestLabel,
            createdAt: moment(created_at).format('MMMM Do YYYY'),
            isPending: moment(created_at).isAfter(weekOld),
        };
    });
};

/**
 *  Returns array of status flag
 *  eg: [true, false]
 */
const checkMergeStatus = async ({ list, octokit }) => {
    const result = await Promise.all(
        _.map(list, async pr => {
            const { repoName, number } = pr;
            // outputs an array
            const repoDetails = repoName.split('/');

            try {
                const { headers } = await octokit.pulls.checkIfMerged({
                    owner: repoDetails[0],
                    repo: repoDetails[1],
                    pull_number: number,
                });
                // status if merged
                return headers.status === '204 No Content';
            } catch (err) {
                // status if not merged
                if (err.status === 404) {
                    return false;
                }
            }
        })
    );
    return result;
};

/**
 *  Fetch User Pull Requests Status
 */

exports.getUserPRs = async ({ username, octokit }) => {
    const { list = [] } = await loadPRs({ username, octokit });
    const parsedPRsList = await parsePRs({ list });
    const mergedStatusList = await checkMergeStatus({ list: parsedPRsList, octokit });
    /**
     *  Add `merged` status to each item
     */
    const PRs = _.zipWith(parsedPRsList, mergedStatusList, (pr, merged) => {
        return _.assign(pr, { merged });
    });

    return {
        data: PRs,
        fetchedAt: new Date().toJSON(),
    };
};

const loadRepos = async ({ page, perPage, octokit }) => {
    let list = [];
    try {
        list = await octokit.search.issuesAndPullRequests({
            q: 'label:hacktoberfest+state:open',
            page,
            per_page: perPage,
        });
        // eslint-disable-next-line no-empty
    } catch (err) {}
    return list;
};

const parseRepos = list => {
    return _.map(list, item => {
        const repo = item.repository_url.split('/');
        const repoName = repo[repo.length - 1];
        const { number, state, title, html_url, user, created_at } = item;
        return {
            title,
            number,
            repoName,
            user: {
                login: user.login,
                url: user.html_url,
            },
            url: html_url,
            open: state === 'open',
            createdAt: moment(created_at).format('MMMM Do YYYY'),
        };
    });
};

/**
 *  Fetch Hacktoberfest Labelled Repos
 */

exports.getHacktoberfestRepos = async ({ page, perPage, octokit }) => {
    const list = await loadRepos({ page, perPage, octokit });
    const parsedRepoList = parseRepos(list.data.items);
    return {
        data: parsedRepoList,
        fetchedAt: new Date().toJSON(),
    };
};

exports.getUserDetails = async ({ username, octokit }) => {
    const {
        data: { avatar_url },
    } = await octokit.users.getByUsername({
        username,
    });

    return {
        user: {
            userImage: avatar_url,
            username,
        },
    };
};
