const {
  DeviceDiscovery,
  AsyncDeviceDiscovery,
} = require('sonos')

const snoop = new AsyncDeviceDiscovery()

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

  console.log(Object.keys(speakers))
}

main().then(() => process.exit())
