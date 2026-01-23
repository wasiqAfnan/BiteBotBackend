const contactUsAutoReplyTemplate = ({ name }) => {
  return `
  <!DOCTYPE html>
  <html>
    <head>
      <meta charset="UTF-8" />
      <title>BiteBot – We’ve received your message</title>
    </head>
    <body style="margin:0;padding:0;background-color:#f3f4f6;">
      <table width="100%" cellpadding="0" cellspacing="0" style="padding:20px;">
        <tr>
          <td align="center">
            <table width="100%" max-width="520" cellpadding="0" cellspacing="0"
              style="
                background:#ffffff;
                border-radius:8px;
                padding:32px;
                box-shadow:0 10px 25px rgba(0,0,0,0.05);
                font-family:Arial,sans-serif;
              ">
              
              <!-- Brand -->
              <tr>
                <td align="center" style="padding-bottom:20px;">
                  <h1 style="margin:0;color:#4f46e5;">BiteBot 🤖</h1>
                </td>
              </tr>

              <!-- Greeting -->
              <tr>
                <td>
                  <h2 style="color:#111827;margin-bottom:10px;">
                    Hi ${name} 👋
                  </h2>
                </td>
              </tr>

              <!-- Message -->
              <tr>
                <td style="color:#374151;font-size:15px;line-height:1.6;">
                  <p>
                    Thanks for reaching out to <strong>BiteBot</strong>!
                  </p>

                  <p>
                    We’ve received your message and our team is currently reviewing it.
                    One of our support members will get back to you as soon as possible.
                  </p>

                  <p>
                    We always aim to respond within <strong>24–48 hours</strong>.
                    Thank you for your patience while we work on your request 🙏
                  </p>

                  <p>
                    In the meantime, feel free to explore BiteBot and discover
                    smarter, happier food choices 🍽️
                  </p>

                  <p style="margin-top:24px;">
                    Warm regards,<br />
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
                    This is an automated message to confirm we received your inquiry.
                    Please do not reply directly to this email.
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

export default contactUsAutoReplyTemplate;
