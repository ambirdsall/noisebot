const camelcase = roomName => roomName.split(' ').reduce(
  (camel, word) => {
    // the "f" is for "formatted"
    let fWord = word.toLowerCase()

    // capitalize the first letter for all but the first word
    if (camel) {
      fWord = fWord[0].toUpperCase() + fWord.slice(1)
    }
    return camel + fWord
  },
  ''
)

module.exports = {
  camelcase,
}
