const readline = require('readline/promises')
const {
  DeviceDiscovery,
  AsyncDeviceDiscovery,
} = require('sonos')

const snoop = new AsyncDeviceDiscovery()

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
  const speakers = devices.reduce(
    (knownSpeakers, speaker) => ({
      ...knownSpeakers,
      [speaker.deets.roomName]: speaker
    }), {})

  listenForKeys({
    l() { console.log(Object.keys(speakers)) },
    r() { console.log(`pretend I'm Jupiter and I'm selecting the line in for the record player, grouped with some other speakers`) },
    q() { process.exit(0) },
  })

  console.log('listening')

  // keep it looping forever
  setInterval(() => {}, 1 << 30)
}

main()
