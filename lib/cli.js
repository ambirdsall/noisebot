const readline = require('readline/promises')

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
  const defaults = {
    q() {
      console.log('byeeeeeee')
      closer()
    },
  }
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

  // allow toggling the key listener inside the keymap however it's defined (for doing
  // fancypants stuff like opening a custom repl)
  const _stopListening = () => rl.input.off('keypress', onKeypress)
  const _startListening = () => rl.input.on('keypress', onKeypress)

  Object.assign(keymap, { _stopListening, _startListening })

  // kick things off
  _startListening()

  return { rl, onKeypress, keymap }
}

module.exports = {
  listenForKeys,
}
