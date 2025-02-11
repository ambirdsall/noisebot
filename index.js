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
// returns a readline interface, an open stream which will keep the process alive until it
// is closed. There are a few ways to do that:
// - by explicitly closing the returned stream `rl` (`rl.close()`)
// - by providing a function arg, which will be called with one argument (an
//   `rl`-closing closure) and is expected to return a keymap object
// - by providing an object arg whose keys do not conflict with the default binding, "q" open
const listenForKeys = (keybindings) => {
  const { stdin: input, stdout: output } = process
  const rl = readline.createInterface({input, output})
  const closer = rl.close.bind(rl)
  const defaults = { q: closer }
  let keymap
  if (typeof keybindings === 'function') {
    keymap = keybindings(closer)
  } else {
    keymap = {...defaults, ...keybindings}
  }

  const onKeypress = (key, data) => {
    const keybind = keymap[key] || keymap[key.toLowerCase()]

    // add a newline so the user-entered character is separated from the
    // command output
    console.log("")

    if (typeof keybind === 'function') keybind.bind(keymap)()
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
        console.log('grouped!')
        setTimeout(() => this.g(), 1000)
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
  })

  console.log('listening')
  // this train keeps a-rolling until the readline interface is closed (see above)
}

main()
