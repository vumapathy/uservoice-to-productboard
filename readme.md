## Introduction
This is a script to help move your data out of UserVoice (https://www.uservoice.com/), a tool for capturing customer feedback, to ProductBoard (https://www.productboard.com/), a similar (but in my opinion, better!) tool.

## Getting Started
This script assumes that you are an Admin in both the UserVoice and ProductBoard accounts for your organization.

1. Go to https://<SUBDOMAIN>.uservoice.com/admin/settings/integrations using the subdomain for your organization
2. Choose UserVoice API Key
3. Click the "Generate API Key" button 
4. Copy the API key into `config-template.json` under the `uservoice_ui_token` key.
5. Add your company's UserVoice subdomain under the `subdomain` key and rename the file to `config.json`
6. In the same directory as `index.js`, run `npm install`

## Importing Notes into ProductBoard
1. Run `node index.js` from the project directory
2. Find the output file `output.csv`, open it, and make sure that the content looks correct
3. Go to https://<SUBDOMAIN>.productboard.com/inbox using the subdomain for your organization
4. Mouse over the "+" on the bottom left and choose "Import Notes"
5. Select `output.csv`.  Productboard will take it from here!

## Caveats
* Does not account for custom labels in UserVoice (only forum names)
* Does not elegantly combine votes -- each vote is created as a separate note, but with an easily searchable name
* Ignores all content that isnt the title and body of a suggestion (comments etc. are not captured)
