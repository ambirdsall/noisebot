const readline = require('readline/promises')
const {
  DeviceDiscovery,
  AsyncDeviceDiscovery,
} = require('sonos')

const snoop = new AsyncDeviceDiscovery()

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
const listenForKeys = (keymap) => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  const onKeypress = (key, data) => {
    const keybind = keymap[key] || keymap[key.toLowerCase()]

    // add a newline so the user-entered character is separated from the
    // command output
    console.log("")

    if (typeof keybind === 'function') keybind()
  }

  rl.input.on('keypress', onKeypress)
  return rl
}

async function main() {
  let devices = await snoop.discoverMultiple()
  devices = await Promise.all(
    devices.map(async (device) => {
      const deets = await device.deviceDescription()
      return {device, deets}
    })
  )
  const rooms = devices.reduce(
    (knownSpeakers, speaker) => ({
      ...knownSpeakers,
      [camelcase(speaker.deets.roomName)]: speaker,
    }), {})

  listenForKeys({
    l() {
      console.log(Object.keys(rooms))
    },
    r() {
      const lineIn = rooms.lineIn.deets.roomName
      Promise.all([
        rooms.livingRoom.device.joinGroup(lineIn),
        rooms.kitchen.device.joinGroup(lineIn),
      ]).then(successes => {
        console.log(`pretend I'm Jupiter and I just grouped the line in with the living room and kitchen speakers`)
      }).catch(err => console.warn('wtf: ', err))
    },
    g() {
      const { device, deets } = rooms.lineIn
      device.getAllGroups()
        .then(
          groups => groups
            .find(g => g.Name.includes(deets.roomName))
            .ZoneGroupMember.map(({UUID, ZoneName}) => ({UUID, ZoneName}))
        )
        .then(groups => console.log('Groups:', groups))
    },
    q() { process.exit(0) },
  })

  console.log('listening')

  // keep it looping forever
  setInterval(() => {}, 1 << 30)
}

main()
