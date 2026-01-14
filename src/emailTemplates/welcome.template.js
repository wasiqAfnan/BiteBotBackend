const welcomeTemplate = ({ name }) => {
    return `
      <div style="font-family: Arial, sans-serif;">
        <h2>Hello ${name} 👋</h2>
        <p>Welcome to <strong>BiteBot</strong>.</p>
        <p>We’re excited to have you on board.</p>
        <br />
        <p>— Team BiteBot</p>
      </div>
    `;
};

export default welcomeTemplate;
