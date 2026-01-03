import { createTransporter } from '../configs/nodemailer.config.js';
import constants from '../constants.js';

const sendMail = async ({ to, subject, text, html }) => {
  try {
    const transporter = await createTransporter();
    // console.log(constants.AUTHORIZE_MAIL)
    const mailOptions = {
      from: `Wasiq <${constants.AUTHORIZE_MAIL}>`,
      to,
      subject,
      text,
      html,
    };

    const info = await transporter.sendMail(mailOptions);
    return info;
  } catch (error) {
    console.log('sendMail error:', error.message);
  }
};

export default sendMail;
