const contactUsTemplate = ({ name, email, message }) => {
  return `
  <!DOCTYPE html>
  <html>
    <head>
      <meta charset="UTF-8" />
      <title>BiteBot – New Contact Message</title>
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
                  <p style="margin:6px 0 0;color:#6b7280;font-size:14px;">
                    New Contact Us Submission
                  </p>
                </td>
              </tr>

              <!-- Divider -->
              <tr>
                <td style="padding:16px 0;">
                  <hr style="border:none;border-top:1px solid #e5e7eb;" />
                </td>
              </tr>

              <!-- User Details -->
              <tr>
                <td style="font-size:15px;color:#374151;line-height:1.6;">
                  <p><strong>Name:</strong> ${name}</p>
                  <p><strong>Email:</strong> ${email}</p>
                </td>
              </tr>

              <!-- Message -->
              <tr>
                <td style="padding-top:16px;">
                  <p style="font-size:15px;color:#111827;margin-bottom:8px;">
                    <strong>Message:</strong>
                  </p>
                  <div style="
                    background:#f9fafb;
                    padding:16px;
                    border-radius:6px;
                    font-size:14px;
                    color:#374151;
                    white-space:pre-line;
                  ">
                    ${message}
                  </div>
                </td>
              </tr>

              <!-- Footer -->
              <tr>
                <td style="padding-top:28px;">
                  <hr style="border:none;border-top:1px solid #e5e7eb;" />
                </td>
              </tr>

              <tr>
                <td style="font-size:12px;color:#6b7280;line-height:1.5;">
                  <p>
                    This message was sent via the BiteBot Contact Us form.
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

export default contactUsTemplate;
