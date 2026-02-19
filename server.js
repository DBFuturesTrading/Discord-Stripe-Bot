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

      await member.roles.add(process.env.PREMIUM_ROLE_ID);

      console.log(`🎉 Role given to user ${discordId}`);
    } catch (error) {
      console.error('❌ Error assigning role:', error);
    }
  }
// REMOVE ROLE ON REFUND
if (event.type === 'charge.refunded') {

    const charge = event.data.object;

    try {
        const sessions = await stripe.checkout.sessions.list({
            payment_intent: charge.payment_intent,
            limit: 1
        });

        if (sessions.data.length > 0) {

            const discordId = sessions.data[0].client_reference_id;

            const guild = await client.guilds.fetch(process.env.GUILD_ID);
            const member = await guild.members.fetch(discordId);

            await member.roles.remove(process.env.PREMIUM_ROLE_ID);

            console.log(`❌ Role removed from user ${discordId}`);
        }

    } catch (error) {
        console.error("❌ Error removing role:", error);
    }
}
// REMOVE ROLE ON SUBSCRIPTION CANCEL
if (event.type === 'customer.subscription.deleted') {

    const subscription = event.data.object;

    try {
        const sessions = await stripe.checkout.sessions.list({
            subscription: subscription.id,
            limit: 1
        });

        if (sessions.data.length > 0) {

            const discordId = sessions.data[0].client_reference_id;

            const guild = await client.guilds.fetch(process.env.GUILD_ID);
            const member = await guild.members.fetch(discordId);

            await member.roles.remove(process.env.PREMIUM_ROLE_ID);

            console.log(`❌ Role removed (subscription ended) for ${discordId}`);
        }

    } catch (error) {
        console.error("❌ Error removing role after subscription deletion:", error);
    }
}
if (event.type === 'invoice.paid') {

    const invoice = event.data.object;

    try {
        const sessions = await stripe.checkout.sessions.list({
            subscription: invoice.subscription,
            limit: 1
        });

        if (sessions.data.length > 0) {

            const discordId = sessions.data[0].client_reference_id;

            const guild = await client.guilds.fetch(process.env.GUILD_ID);
            const member = await guild.members.fetch(discordId);

            await member.roles.add(process.env.PREMIUM_ROLE_ID);

            console.log(`✅ Role ensured active for ${discordId}`);
        }

    } catch (error) {
        console.error("Error handling invoice.paid:", error);
    }
}
if (event.type === 'invoice.payment_failed') {

    const invoice = event.data.object;

    try {
        const sessions = await stripe.checkout.sessions.list({
            subscription: invoice.subscription,
            limit: 1
        });

        if (sessions.data.length > 0) {

            const discordId = sessions.data[0].client_reference_id;

            const guild = await client.guilds.fetch(process.env.GUILD_ID);
            const member = await guild.members.fetch(discordId);

            await member.roles.remove(process.env.PREMIUM_ROLE_ID);

            console.log(`❌ Role removed due to failed payment for ${discordId}`);
        }

    } catch (error) {
        console.error("Error handling payment failure:", error);
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

client.once(Events.ClientReady, async () => {
  console.log('🤖 Discord Bot is Online');
    // Register slash commands
    await client.application.commands.set([
        {
            name: 'subscribe',
            description: 'Subscribe to premium'
        },
        {
            name: 'cancel',
            description: 'Cancel your subscription at the end of the billing period'
        }
    ]);

    console.log('Slash commands registered');
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
  }if (interaction.commandName === 'cancel') {
  try {
    await interaction.deferReply({ ephemeral: true });

    const discordId = interaction.user.id;

    // Find Stripe checkout session for this user
    const sessions = await stripe.checkout.sessions.list({
      limit: 100,
    });

    const session = sessions.data.find(
      s => s.client_reference_id === discordId
    );

    if (!session || !session.subscription) {
      return interaction.editReply("No active subscription found.");
    }

    await stripe.subscriptions.update(session.subscription, {
      cancel_at_period_end: true,
    });

    interaction.editReply(
      "✅ Your subscription has been scheduled to cancel at the end of the billing period. You will keep access until then."
    );

  } catch (error) {
    console.error("❌ Error in cancel command:", error);
    interaction.editReply("Something went wrong. Please try again.");
  }
}
});

client.login(process.env.DISCORD_TOKEN);
