import { google } from 'googleapis';
import constants from '../constants.js';

if (!constants.REFRESH_TOKEN) {
  throw new Error('REFRESH_TOKEN is missing. Check dotenv loading.');
}

const oAuth2Client = new google.auth.OAuth2(
  constants.CLIENT_ID,
  constants.CLIENT_SECRET,
  constants.REDIRECT_URI
);

oAuth2Client.setCredentials({
  refresh_token: constants.REFRESH_TOKEN,
});

export default oAuth2Client;