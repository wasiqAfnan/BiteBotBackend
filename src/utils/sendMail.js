// import { createTransporter } from '../configs/nodemailer.config.js';
// import constants from '../constants.js';

// const sendMail = async (to, subject, html) => {
//   try { 
//     const transporter = await createTransporter();
//     // console.log(constants.AUTHORIZE_MAIL)
//     const mailOptions = {
//       from: `Bitebot <${constants.AUTHORIZE_MAIL}>`,
//       to,
//       subject,
//       html,
//     };

//     const info = await transporter.sendMail(mailOptions);
//     // console.log("From Sendmail.js",info)
//     return info;
//   } catch (error) {
//     console.log('sendMail error:', error);
//   }
// };

// export default sendMail;


import axios from 'axios';
import constants from '../constants.js';
// UPDATED: Imported oauth2Client directly to get tokens manually, bypassing Nodemailer
import oauth2Client from '../configs/smtp.config.js';

// NEW: Helper function to encode string to Base64URL (Required by Gmail API)
// This replaces the internal encoding Nodemailer used to do.
const base64UrlEncode = (str) => {
  return Buffer.from(str)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
};

// NEW: Helper to manually build the email structure (MIME standards)
// We need this because we aren't using Nodemailer's build engine anymore.
const buildEmail = (to, subject, html, from = `Bitebot <${constants.AUTHORIZE_MAIL}>`) => {
  // RFC 2822 standard requires \r\n for line breaks in headers
  return [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/html; charset=UTF-8`,
    ``, // Empty line separates headers from body
    html,
  ].join('\r\n');
};

const sendMail = async (to, subject, html) => {
  try {
    // UPDATED: Manually fetching the Access Token.
    // We need this token to authorize the HTTP request below.
    const { token: accessToken } = await oauth2Client.getAccessToken();

    if (!accessToken) {
      throw new Error("Failed to generate Access Token");
    }

    // UPDATED: Construct the raw email string and encode it
    const raw = base64UrlEncode(
      buildEmail(to, subject, html)
    );

    // UPDATED: Sending via standard HTTPS (Port 443).
    // Render does NOT block Port 443, so this bypasses the "ETIMEDOUT" error.
    const response = await axios.post(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
      { raw },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    // console.log("Email sent successfully via API:", response.data);
    return response.data;

  } catch (error) {
    // Log detailed error info if available (axios errors usually hide deep in .response)
    const errorMessage = error.response ? JSON.stringify(error.response.data) : error.message;
    console.log('sendMail error:', errorMessage);
    
    // Optional: throw error if you want the calling function to know it failed
    throw error; 
  }
};

export default sendMail;
