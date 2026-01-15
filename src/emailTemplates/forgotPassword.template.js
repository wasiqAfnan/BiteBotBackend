const forgotPasswordTemplate = ({ name, resetLink }) => {
    return `
  <!DOCTYPE html>
  <html>
    <head>
      <meta charset="UTF-8" />
      <title>BiteBot – Reset Your Password</title>
    </head>
    <body style="margin:0;padding:0;background-color:#f3f4f6;">
      <table width="100%" cellpadding="0" cellspacing="0" style="padding:20px;">
        <tr>
          <td align="center">
            <table width="100%" max-width="520" cellpadding="0" cellspacing="0"
              style="background:#ffffff;border-radius:8px;padding:32px;box-shadow:0 10px 25px rgba(0,0,0,0.05);font-family:Arial,sans-serif;">
              
              <!-- Brand -->
              <tr>
                <td align="center" style="padding-bottom:20px;">
                  <h1 style="margin:0;color:#4f46e5;">BiteBot</h1>
                </td>
              </tr>

              <!-- Heading -->
              <tr>
                <td>
                  <h2 style="color:#111827;margin-bottom:10px;">
                    Reset your password
                  </h2>
                </td>
              </tr>

              <!-- Content -->
              <tr>
                <td style="color:#374151;font-size:15px;line-height:1.6;">
                  <p>Hello ${name},</p>

                  <p>
                    We received a request to reset the password for your BiteBot account.
                    Click the button below to set a new password.
                  </p>

                  <!-- CTA Button -->
                  <div style="text-align:center;margin:28px 0;">
                    <a href="${resetLink}"
                      style="display:inline-block;padding:12px 24px;
                      background:#4f46e5;color:#ffffff;text-decoration:none;
                      border-radius:6px;font-weight:bold;">
                      Reset Password
                    </a>
                  </div>

                  <!-- Visible Link Section -->
                  <p style="margin-top:10px;">
                    Or copy and paste this link into your browser:
                  </p>

                  <p style="
                    background:#f9fafb;
                    padding:12px;
                    border-radius:6px;
                    font-size:14px;
                    word-break:break-all;
                    color:#4f46e5;">
                    ${resetLink}
                  </p>

                  <p>
                    This password reset link will expire in
                    <strong>15 minutes</strong> for security reasons.
                  </p>

                  <p>
                    If you didn’t request a password reset, you can safely ignore this email.
                    Your account remains secure.
                  </p>

                  <p style="margin-top:24px;">
                    Thanks,<br />
                    <strong>The BiteBot Team</strong>
                  </p>
                </td>
              </tr>

              <!-- Divider -->
              <tr>
                <td style="padding:24px 0;">
                  <hr style="border:none;border-top:1px solid #e5e7eb;" />
                </td>
              </tr>

              <!-- Footer -->
              <tr>
                <td style="font-size:12px;color:#6b7280;line-height:1.5;">
                  <p>
                    If you have any questions, contact our support team.
                  </p>
                  <p>
                    © ${new Date().getFullYear()} BiteBot. All rights reserved.
                  </p>
                </td>
              </tr>

            </table>
          </td>
        </tr>
      </table>
    </body>
  </html>
    `;
};

export default forgotPasswordTemplate;
