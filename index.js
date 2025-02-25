const repl = require('node:repl')
const net = require('node:net')

const {
  DeviceDiscovery,
  AsyncDeviceDiscovery,
} = require('sonos')

const { camelcase } = require('./lib/strings')
const { listenForKeys } = require('./lib/cli')
const { wait } = require('./lib/time')

const openRepl = extraContext => {
  // if you change `replSocketPath`, also change the reference in `./bin/repl`
  const replSocketPath = '/tmp/noisebot-repl.sock'
  const replServer = net.createServer(socket => {
    const r = repl.start({
      input: socket,
      output: socket,
      terminal: true,
      useColors: true,
    })
    Object.assign(r.context, extraContext)
    r.on('exit', () => socket.end())
  })
  replServer.listen(replSocketPath)
  console.log(`To interact with this process via a node repl, run '<noisebot directory>/bin/repl' in another tty`)
  return replServer
}

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

const isInGroup = (group, device) => {
  return group.ZoneGroupMember.find(m => m.Location.includes(device.host))
}

const makeForRoomsInGroup = rooms => (group, cb) => {
  const groupedRooms = []
  Object.keys(rooms).sort().forEach(roomName => {
    const room = rooms[roomName]
    if (isInGroup(group, room.device)) groupedRooms.push(room)
  })
  return groupedRooms.map(cb)
}

// Is there any difference between a "room" and a "speaker"? No. But we still use both: it
// better distinguishes the coordinator room's distinct role, but mainly it's just because
// `makeRoomToggleForRoomGroup` is a *way* shittier name.
const makeRoomToggleForSpeakerGroup = coordinatorRoom => async (roomToToggle) => {
  const coordinatorGroup = await ensureRoomHasOwnGroup(coordinatorRoom)
  const groupName = coordinatorRoom.deets.roomName
  const { device, deets } = roomToToggle

  // returns a promise you can `await`
  if (isInGroup(coordinatorGroup, device)) {
    console.log(`Removing ${deets.roomName} from group ${coordinatorGroup.Name}`)
    return device.leaveGroup()
  } else {
    console.log(`Adding ${deets.roomName} to group ${coordinatorGroup.Name}`)
    return device.joinGroup(groupName)
  }
}

async function main() {
  // uncomment options arg if you want sane connection limits for testing and development
  const { rooms } = await findLineInEtAl(/* { maxTries: 3 } */)


  const {
    lineIn,
    livingRoom,
    kitchen,
    tvRoom,
    bedroom,
  } = rooms

  const ensureLineInIsSource = async () => {
    const macCleaned = (await lineIn.device.getZoneInfo()).MACAddress.replace(/:/g, '')

    // TODO make play/pause button set this if it's not already the AV source instead of
    // trying to do some shit that will not work
    await lineIn.device.setAVTransportURI(`x-rincon-stream:RONCON_${macCleaned}01400`)
  }

  const toggleRoom = makeRoomToggleForSpeakerGroup(lineIn)
  const forRoomsInGroup = makeForRoomsInGroup(rooms)

  const replServer = openRepl({
    rooms,
    ...rooms,
    isInGroup,
    forRoomsInGroup,
    toggleRoom,
    ensureLineInIsSource,
    ensureRoomHasOwnGroup,
  })

  const roomToggles = {
    async l() {
      try {
        console.log("toggling livingRoom")
        // await ensureLineInIsSource()
        await toggleRoom(livingRoom)
      } catch (error) {
        console.log("error:" + error)
      }
    },
    async t() {
      try {
        console.log("toggling tvRoom")
        // await ensureLineInIsSource()
        await toggleRoom(tvRoom)
      } catch (error) {
        console.log("error:" + error)
      }

    },
    async k() {
      try {
        console.log("toggling kitchen")
        // await ensureLineInIsSource()
        await toggleRoom(kitchen)
      } catch (error) {
        console.log("error:" + error)
      }

    },
  }
  const volumeControls = {
    _volumeIncrement: 4,
    async m() {
      const lineInGroup = await ensureRoomHasOwnGroup(lineIn)
      // This currently toggles mute status independently for eaach speaker in the group
      // instead of managing the group as a whole.
      // TODO if any speaker in group is unmuted, mute all; else unmute all
      forRoomsInGroup(lineInGroup, async (room) => {
        const { device } = room
        await device.setMuted(!await device.getMuted())
      })
    },
    async d() {
      const lineInGroup = await ensureRoomHasOwnGroup(lineIn)
      forRoomsInGroup(lineInGroup, async (room) => {
        const { device, deets } = room
        const newVolume = await device.getVolume() - this._volumeIncrement
        console.log(`lowering ${deets.roomName} volume to ${newVolume}`)
        await device.setVolume(newVolume)
      })
    },
    async u() {
      const lineInGroup = await ensureRoomHasOwnGroup(lineIn)
      forRoomsInGroup(lineInGroup, async (room) => {
        const { device, deets } = room
        const newVolume = await device.getVolume() + this._volumeIncrement
        console.log(`raising ${deets.roomName} volume to ${newVolume}`)
        await device.setVolume(newVolume)
      })
    },
  }
  const playbackControls = {
    async p() {
      try {
        await ensureLineInIsSource()
        // TODO check if lineIn's source is the line in per se
        // TODO if so???
        // TODO if not, togglePlayback
        // await lineIn.device.togglePlayback()
      } catch (error) {
        console.error(error)
      }
    },
    async b() {
      try {
        // TODO check if lineIn's source is the line in per se
        // TODO if so???
        // TODO if not, previous
        await lineIn.device.previous()
      } catch (error) {
        console.error(error)
      }
    },
    async f() {
      try {
        // TODO check if lineIn's source is the line in per se
        // TODO if so???
        // TODO if not, next
        await lineIn.device.next()
      } catch (error) {
        console.error(error)
      }
    },
  }
  const debugCommands = {
    "?": () => console.log(Object.keys(rooms)),
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
  }

  listenForKeys(closer => ({
    ...roomToggles,
    ...volumeControls,
    ...playbackControls,
    ...debugCommands,
    q() {
      closer()
      // TODO ensure replServer.close() for other ways this process may exit (SIGINT et al)
      replServer.close()
      process.exit()
    },
  }))

  console.log("Now stroke them keys, I'm all ears")
}

main()
