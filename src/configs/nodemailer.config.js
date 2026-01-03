import nodemailer from 'nodemailer';
import oAuth2Client from './smtp.config.js';
import constants from '../constants.js';

export const createTransporter = async () => {
  const { token } = await oAuth2Client.getAccessToken();

  if (!token) {
    throw new Error('Failed to generate access token');
  }

  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      type: 'OAuth2',
      user: constants.AUTHORIZE_MAIL,
      clientId: constants.CLIENT_ID,
      clientSecret: constants.CLIENT_SECRET,
      refreshToken: constants.REFRESH_TOKEN,
      accessToken: token,
    },
  });
};