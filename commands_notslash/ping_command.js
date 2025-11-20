module.exports = {
  name: 'ping',
  description: 'Pong cevabı verir.',
  async execute(message, args) {
    message.reply('Pong!');
  }
}