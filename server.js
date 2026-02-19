require('dotenv').config();

const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const {
  Client,
  GatewayIntentBits,
  Events
} = require('discord.js');

const app = express();
const PORT = 3000;

/* ================= STRIPE WEBHOOK ================= */

app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];

  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('❌ Webhook signature verification failed.');
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log(`✅ Stripe event received: ${event.type}`);

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;

    const discordId = session.client_reference_id;

    if (!discordId) {
      console.log('❌ No Discord ID found in session.');
      return res.status(200).send();
    }

    try {
      const guild = await client.guilds.fetch(process.env.GUILD_ID);
      const member = await guild.members.fetch(discordId);

      await member.roles.add(process.env.DISCORD_ROLE_ID);

      console.log(`🎉 Role given to user ${discordId}`);
    } catch (error) {
      console.error('❌ Error assigning role:', error);
    }
  }

  res.status(200).send();
});

app.use(express.json());

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

/* ================= DISCORD BOT ================= */

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]
});

client.once(Events.ClientReady, () => {
  console.log('🤖 Discord Bot is Online');
});

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'subscribe') {
    try {
      console.log('🔹 /subscribe triggered');

      const paymentLink = `${process.env.STRIPE_PAYMENT_LINK}?client_reference_id=${interaction.user.id}`;

      await interaction.reply({
        content: `Click here to subscribe:\n${paymentLink}`,
        ephemeral: true
      });

    } catch (error) {
      console.error('❌ Error in subscribe command:', error);

      if (!interaction.replied) {
        await interaction.reply({
          content: 'Something went wrong. Please try again.',
          ephemeral: true
        });
      }
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
