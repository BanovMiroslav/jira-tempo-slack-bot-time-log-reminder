const {getNotLoggedDaysForUser, getSlackUserIdByEmail, sendSlackMessage, inviteToChannel} = require('./utils/jira-utils')
const cron = require('node-cron');
const dotenv = require("dotenv")
dotenv.config()
dotenv.config({ path: `.env.local`, override: true });

const EMAILS_LIST = (process.env.EMAIL_LIST || "").split(',').map(s => s.trim())
const SLACK_CHANNEL_ID = process.env.SLACK_CHANNEL_ID
const ENABLE_WINNERS = process.env.ENABLE_WINNERS === 'true'
const WINNERS_MIN_DAYS = process.env.WINNERS_MIN_DAYS

// Function to execute every day
async function executeCron() {

  const winners = []
  const chatMessages = []
  EMAILS_LIST.map(email => {
    const promise = getNotLoggedDaysForUser(email).then(({notLoggedDays, userData}) => {
      if (!notLoggedDays?.length) {
        // All is logged!
        return;
      }

      return getSlackUserIdByEmail(email).then(userId => {
        const {displayName} = userData
        const directMessage = `Hello ${displayName}, please log your time for the following days: ${notLoggedDays.join(', ')}`
        sendSlackMessage(userId, directMessage)

        if (ENABLE_WINNERS && notLoggedDays?.length >= WINNERS_MIN_DAYS) {
          winners.push({
            email,
            slackUserId: userId,
            userData,
            notLoggedDays: notLoggedDays.length
          })
        }
      })
    })

    chatMessages.push(promise)
  })

  return Promise.all(chatMessages).then(() => {
    // Finish if no winners.
    if (!winners.length) {
      return true
    }

    const invites = []
    const channelMessage = winners.sort((a,b) => {
      return b.notLoggedDays - a.notLoggedDays
    }).map((item, index) => {
      // Push the invite.
      invites.push(inviteToChannel(item.slackUserId, SLACK_CHANNEL_ID))

      // Build the message row.
      const place = index + 1;

      let icon = ':clap:'
      switch (place) {
        case 1:
          icon = ':first_place_medal:'
          break;
        case 2:
          icon = ':second_place_medal:'
          break;
        case 3:
          icon = ':third_place_medal:'
          break;
      }

      return `${place} place: <@${item.slackUserId}> with ${item?.notLoggedDays} days! ${icon}`;
    }).join('\n')

    // After they were all invited - send the message to the channel.
    return Promise.all(invites).then(() => {
      sendSlackMessage(SLACK_CHANNEL_ID, channelMessage)
    })
  })
}

// executeCron().then(() => console.log('Success!'))

// Schedule the cron job to execute the function every day at a specific time (e.g., 9:00 AM)
cron.schedule('0 15 * * 1-5', () => {
  executeCron().then(() => {
    console.log('Cron run success!')
  }).catch(err => {

  });
});
