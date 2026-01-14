import { google } from 'googleapis';
import constants from '../constants.js';

if (!constants.GMAIL_API_REFRESH_TOKEN) {
  throw new Error('REFRESH_TOKEN is missing. Check dotenv loading.');
}

const oAuth2Client = new google.auth.OAuth2(
  constants.GMAIL_API_CLIENT_ID,
  constants.GMAIL_API_CLIENT_SECRET,
  constants.GMAIL_API_REDIRECT_URI
);

oAuth2Client.setCredentials({
  refresh_token: constants.GMAIL_API_REFRESH_TOKEN,
});

export default oAuth2Client;