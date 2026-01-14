const forgotPasswordTemplate = ({ name, resetLink }) => {
    return `
      <div style="font-family: Arial, sans-serif;">
        <h2>Password Reset Request</h2>
        <p>Hello ${name},</p>
        <p>You requested to reset your password.</p>
        <a href="${resetLink}"
           style="padding:10px 15px;background:#4f46e5;color:#fff;text-decoration:none;border-radius:5px;">
           Reset Password
        </a>
        <p>If you didn’t request this, please ignore this email.</p>
      </div>
    `;
};

export default forgotPasswordTemplate;
