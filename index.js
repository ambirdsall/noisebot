const {
  DeviceDiscovery,
  AsyncDeviceDiscovery,
} = require('sonos')

const { camelcase } = require('./lib/strings')
const { listenForKeys } = require('./lib/cli')
const { wait } = require('./lib/time')

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
    async r() {
      const { device, deets } = rooms.lineIn
      const groups = await device.getAllGroups()
      const lineInGroup = groups.find(g => g.CoordinatorDevice().host === device.host)
      if (!lineInGroup) {
        await rooms.lineIn.device.leaveGroup()
        await wait(800)
      }
      const lineInN = deets.roomName
      Promise.all([
        rooms.livingRoom.device.joinGroup(lineInN),
        rooms.kitchen.device.joinGroup(lineInN),
      ]).then(successes => {
        console.log('grouped!')
        setTimeout(() => this.g(), 1000)
      }).catch(err => console.warn('wtf: ', err))
    },
    async g() {
      const { device, deets } = rooms.lineIn
      const groups = await device.getAllGroups()
      const lineInGroup = groups.find(g => g.CoordinatorDevice().host === device.host)
      if (lineInGroup) {
        console.log(lineInGroup.Name, 'contains:', lineInGroup.ZoneGroupMember.map(m => m.ZoneName))
      } else {
        const groupContainingLineIn = groups.find(g => g.ZoneGroupMember.find(m => m.Location.includes(device.host)))
        console.log(groupContainingLineIn.Name, 'contains:', groupContainingLineIn.ZoneGroupMember.map(m => m.ZoneName))
      }
    },
  })

  console.log('listening')
  // this train keeps a-rolling until the readline interface is closed (see above)
}

main()
