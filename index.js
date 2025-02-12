const {
  DeviceDiscovery,
  AsyncDeviceDiscovery,
} = require('sonos')

const { camelcase } = require('./lib/strings')
const { listenForKeys } = require('./lib/cli')

const snoop = new AsyncDeviceDiscovery()

async function findLineInEtAl({ maxTries } = { maxTries: Infinity }) {
  let rooms, devices
  let attempts = 0
  while (!rooms?.lineIn && attempts < maxTries) {
    attempts = attempts + 1
    process.stdout.write(rooms == null ? 'Finding rooms... ' : `Couldn't find "Line In" device, trying again...`)
    devices = await snoop.discoverMultiple()
    devices = await Promise.all(
      devices.map(async (device) => {
        const deets = await device.deviceDescription()
        return {device, deets}
      })
    )
    rooms = devices.reduce(
      (knownSpeakers, speaker) => ({
        ...knownSpeakers,
        [camelcase(speaker.deets.roomName)]: speaker,
      }), {})
    console.log('✅')
  }
  if (!rooms?.lineIn && attempts >= maxTries) {
    console.log(`shit man, i dunno, i can't find the line in box here`)
    process.exit()
  }
  return { rooms, devices }
}

async function main() {
  // TODO remove maxTries option here for the actual physical setup
  const { rooms, devices } = await findLineInEtAl({maxTries: 3})

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
