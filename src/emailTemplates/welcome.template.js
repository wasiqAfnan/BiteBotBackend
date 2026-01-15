const welcomeTemplate = ({ name }) => {
    return `
    <div style="
    font-family: Arial, sans-serif;
    background-color:#f3f4f6;
    padding:24px;
    ">
    <div style="
      max-width:520px;
      margin:0 auto;
      background:#ffffff;
      padding:32px;
      border-radius:10px;
      box-shadow:0 10px 25px rgba(0,0,0,0.05);
    ">

      <!-- Brand -->
      <h1 style="
        margin-top:0;
        color:#4f46e5;
        text-align:center;
      ">
        BiteBot 🤖
      </h1>

      <!-- Greeting -->
      <h2 style="color:#111827;">
        Hello ${name} 👋
      </h2>

      <!-- Intro -->
      <p style="font-size:15px;color:#374151;line-height:1.6;">
        Welcome to <strong>BiteBot</strong> — your smart companion for discovering
        better food, faster decisions, and happier bites 🍽️
      </p>

      <!-- Value -->
      <p style="font-size:15px;color:#374151;line-height:1.6;">
        Whether you’re exploring new dishes, tracking preferences, or making
        mindful choices, BiteBot is here to guide you every step of the way.
      </p>

      <!-- Fun Line -->
      <p style="font-size:15px;color:#374151;line-height:1.6;">     
        Go ahead and explore — your next favorite bite is just a click away 😋
      </p>

      <!-- Footer -->
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />

      <p style="font-size:14px;color:#6b7280;">
        Happy exploring,<br />
        <strong>The BiteBot Team</strong>
      </p>

    </div>
  </div>
    `;
};

export default welcomeTemplate;
