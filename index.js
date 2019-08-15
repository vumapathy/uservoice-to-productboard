const request = require('request-promise');
const _cliProgress = require('cli-progress');
const async = require('async');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const filename = path.join(__dirname, 'output.csv');

// Input these for your organization
var CONFIG = require('./config.json');
var USERVOICE_UI_TOKEN = CONFIG.uservoice_ui_token;
var BASE_USERVOICE_URL = `https://${CONFIG.subdomain}.uservoice.com/api/v2`;

var suggestions = [];
var users = [];
var supporters = [];
var forums = [];
var notes = [];

const go = async () => {
    try {
        // Fetch the Suggestions, Supporters, and necessary Users from UserVoice
        await fetchData();
        // Convert UserVoice Suggestions to ProductBoard Note format
        await convertToNotes();
        // Output Notes to CSV
        await writeToCsv();
    }
    catch (err) {
        console.log(err);
    }
}

const writeToCsv = async () => {
    let output = [];
    let header = ['note_title', 'note_text', 'person_email', 'person_name', 'company_domain', 'tags'];
    output.push(`${header.join()}\n`);
    await async.each(notes, function (n, callback) {
        let row = []; // a new array for each row of data
        row.push(`"${n['note_title']}"`);
        row.push(`"${n['note_text']}"`);
        row.push(n['person_email']);
        row.push(n['person_name']);
        row.push(n['company_domain']);
        row.push(n['tags']);
        output.push(`${row.join()}`);
    }, function (err) {
        if (err) {
            console.log(err);
        } else {
            console.log(`Error preparing csv output`);
        }
    });

    await fs.writeFile(filename, output.join(os.EOL), 'utf8');
    console.log('Output written to: output.csv');
}

const convertToNotes = async () => {
    // First, capture notes from all Suggestions
    await async.each(suggestions, function (suggestion, callback) {
        let note_title = suggestion.title;
        // Text is required for a note, and title is required for a Suggestion
        let note_text = suggestion.body ? suggestion.body : suggestion.title;
        note_text += `\n\nImported from UserVoice, created ${suggestion.created_at}`;
        let author = users.filter(user => user.id === suggestion.links.created_by);
        let person_email = (author && author.length > 0) ? author[0].email_address : '';
        let person_name = (author && author.length > 0) ? author[0].name : '';
        let company_domain = (author && author.length > 0) ? (author[0].email_address ? author[0].email_address.split('@')[1] : '') : '';
        let tags = ''
        if (suggestion.links && suggestion.links.forum) {
            let forum = forums.filter(f => f.id === suggestion.links.forum);
            tags = (forum && forum.length > 0) ? forum[0].name : '';
        }
        let data = {
            'note_title': note_title.replace(/"/g, '""'),
            'note_text': note_text.replace(/"/g, '""'),
            'person_email': person_email,
            'person_name': person_name,
            'company_domain': company_domain,
            'tags': tags
        }
        notes.push(data);
    }, function (err) {
        if (err) {
            console.log(err);
        } else {
            console.log(`Converted ${notes.length} suggestions to notes!`);
        }
    });

    // Next, capture all upvotes as new notes
    await async.each(supporters, function (supporter, callback) {
        let user = users.filter(u => u.id === supporter.links.user);
        let suggestion = suggestions.filter(s => s.id === supporter.links.suggestion);
        if (user && user.length > 0 && suggestion && suggestion.length > 0) {
            let note_text = 'Upvote';
            let note_title = `Upvote for ${suggestion[0].title} at ${supporter.created_at}`
            let person_email = user[0].email_address;
            let person_name = user[0].name;
            let company_domain = user[0].email_address.split('@')[1];
            let tags = '';
            if (suggestion[0].links && suggestion[0].links.forum) {
                let forum = forums.filter(f => f.id === suggestion[0].links.forum);
                tags = (forum && forum.length > 0) ? forum[0].name : '';
            }
            let data = {
                'note_title': note_title.replace(/"/g, '""'),
                'note_text': note_text.replace(/"/g, '""'),
                'person_email': person_email,
                'person_name': person_name,
                'company_domain': company_domain,
                'tags': tags
            }
            notes.push(data);
        }
        else {
            console.log('User not found for supporter!')
        }
    }, function (err) {
        if (err) {
            console.log(err);
        } else {
            console.log(`Converted ${notes.length} suggestions to notes!`);
        }
    });

    console.log(`Converted to ${notes.length} notes`);
}

const fetchData = async () => {
    // Get Suggestions
    console.log(`Retrieving suggestions...`);
    suggestions = await requestSet('suggestions', USERVOICE_UI_TOKEN);
    console.log(`Retrieved ${suggestions.length} suggestions!`);

    // Remove suggestions created before the last import date
    await async.each(suggestions, function (suggestion, callback) {
        if (suggestion && Date.parse(suggestion.created_at) < Date.parse(CONFIG.last_import_date)) {
            suggestions.splice(suggestions.indexOf(suggestion));
        }
    }, function (err) {
        if (err) {
            console.log(err);
        } else {
            console.log(`Error purging suggestions from previous imports`);
        }
    });

    // Get Supporters
    console.log(`Retrieving supporters...`);
    supporters = await requestSet('supporters', USERVOICE_UI_TOKEN);
    console.log(`Retrieved ${supporters.length} supporters!`);

    // Remove supporters created before the last import date
    await async.each(supporters, function (supporter, callback) {
        if (supporter && Date.parse(supporter.created_at) < Date.parse(CONFIG.last_import_date)) {
            supporters.splice(supporters.indexOf(supporter));
        }
    }, function (err) {
        if (err) {
            console.log(err);
        } else {
            console.log(`Error purging supporters from previous imports`);
        }
    });

    // Narrow to just the set of unique users we need to fetch
    let suggestion_authors = suggestions.map(s => s.links.created_by);
    let supporter_authors = supporters.map(s => s.links.user);
    let total_users = suggestion_authors.concat(supporter_authors);
    let unique_users = [...new Set(total_users)];

    // Get Users
    console.log(`Retrieving users...`);
    users = await requestSet('users', USERVOICE_UI_TOKEN, options = {}, uri_suffix = `/${unique_users.join(',')}`, paginate = false);
    console.log(`Retrieved ${users.length} users!`);

    // Get Forums
    console.log(`Retrieving forums...`)
    forums = await requestSet('forums', USERVOICE_UI_TOKEN);
    console.log(`Retrieved ${forums.length} forums!`);
}

const requestSet = async (resource, token, options, uri_suffix, paginate = true) => {
    let records = [];
    let keepGoing = true;
    let cursor = '';
    let bar = new _cliProgress.Bar({}, _cliProgress.Presets.shades_classic);

    if (paginate) {
        while (keepGoing) {
            try {
                let response = await requestPage(resource, token, options, uri_suffix, cursor, paginate);
                if (response) {
                    //console.log(response[resource]);
                    await records.push.apply(records, response[resource]);
                    if (cursor === '') {
                        bar.start(response.pagination.total_records, 0);
                    }
                    if (!response.pagination.cursor) {
                        keepGoing = false;
                        bar.update(records.length);
                        bar.stop();
                        return records;
                    }
                    else {
                        cursor = response.pagination.cursor;
                        bar.update(records.length);
                    }
                }
            }
            catch (err) {
                console.log(err);
            }
        }
    }
    else {
        let response = await requestPage(resource, token, options, uri_suffix, cursor, paginate);
        if (response) {
            await records.push.apply(records, response[resource]);
            return records;
        }
    }
    return records;
}

const requestPage = async (resource, token, options, uri_suffix, cursor, paginate = true) => {
    let opt = options || {};
    let uri = `${BASE_USERVOICE_URL}/admin/${resource}`;
    let suffix = uri_suffix || '';
    let reqUri = cursor === '' ? `${uri}${suffix}`
        : `${uri}${suffix}?cursor=${cursor}`;

    if (paginate) {
        if (cursor) {
            reqUri = `${reqUri}&per_page=100`;
        }
        else {
            reqUri = `${reqUri}?per_page=100`
        }
    }
    const userReq = {
        method: 'GET',
        uri: `${reqUri}`,
        json: opt,
        headers: {
            'Authorization': `Bearer ${token}`
        }
    };
    try {
        let payload = await request(userReq);
        return payload;
    }
    catch (err) {
        console.log(err);
    }
    return null;
}

go()