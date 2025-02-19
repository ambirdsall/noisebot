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

  listenForKeys(closeListener => ({
    "?": () => console.log(Object.keys(rooms)),
    async l() { await toggleRoom(livingRoom) },
    async t() { await toggleRoom(tvRoom) },
    async k() { await toggleRoom(kitchen) },
    r() {
      // since the parent process, i.e. key listener, continues, we have to disable those
      // bindings while the repl is running or shit will get weird
      this._stopListening()

      // now we party
      console.log('Entering REPL')
      const repl = require('node:repl')
      const r = repl.start()
      Object.assign(r.context, rooms)

      // now we clean up
      r.on('exit', () => {
        console.log('Hope that was helpful!')
        this._startListening()
      })
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
  }))

  console.log('listening')
  // this train keeps a-rolling until the readline interface is closed (see above)
}

main()
