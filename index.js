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

const ensureRoomHasOwnGroup = async (coordinatorRoom) => {
  const { device, deets } = coordinatorRoom
  const groups = await device.getAllGroups()
  const coordinatorGroup = groups.find(g => g.CoordinatorDevice().host === device.host)
  if (!coordinatorGroup) {
    await device.leaveGroup()
    // it's annoying, but the change takes some wall clock time to propagate
    await wait(800)
  }
  // we have to re-find the coordinator group in case coordinatorRoom had to leave another group
  return groups.find(g => g.CoordinatorDevice().host === device.host)
}

// Is there any difference between a "room" and a "speaker"? No. But we still use both: it
// better distinguishes the coordinator room's distinct role, but mainly it's just because
// `makeRoomToggleForRoomGroup` is a *way* shittier name.
const makeRoomToggleForSpeakerGroup = coordinatorRoom => async (roomToToggle) => {
  const coordinatorGroup = await ensureRoomHasOwnGroup(coordinatorRoom)
  const groupName = coordinatorRoom.deets.roomName
  const { device, deets } = roomToToggle
  const isInCoordinatorGroup = coordinatorGroup.ZoneGroupMember.find(m => m.Location.includes(device.host))

  // returns a promise you can `await`
  if (isInCoordinatorGroup) {
    console.log(`Removing ${deets.roomName} from group ${coordinatorGroup.Name}`)
    return device.leaveGroup()
  } else {
    console.log(`Adding ${deets.roomName} to group ${coordinatorGroup.Name}`)
    return device.joinGroup(groupName)
  }
}

async function main() {
  // TODO remove maxTries option here for the actual physical setup
  const { rooms, devices } = await findLineInEtAl({maxTries: 3})

  const {
    lineIn,
    livingRoom,
    kitchen,
    tvRoom,
    bedroom,
  } = rooms

  const toggleRoom = makeRoomToggleForSpeakerGroup(lineIn)

  listenForKeys({
    "?": () => console.log(Object.keys(rooms)),
    l() { toggleRoom(livingRoom) },
    t() { toggleRoom(tvRoom) },
    k() { toggleRoom(kitchen) },
    async r() {
      await ensureRoomHasOwnGroup(lineIn)
      const lineInN = lineIn.deets.roomName
      Promise.all([
        livingRoom.device.joinGroup(lineInN),
        kitchen.device.joinGroup(lineInN),
      ]).then(successes => {
        console.log('grouped!')
        setTimeout(() => this.g(), 1000)
      }).catch(err => console.warn('wtf: ', err))
    },
    async g() {
      const { device, deets } = lineIn
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
