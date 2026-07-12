/**
 * First-run setup screen script for bool desktop.
 * Loaded as an external file so CSP script-src 'self' is satisfied (no inline scripts).
 */
const input = document.getElementById('serverUrl')
const btn   = document.getElementById('connectBtn')
const err   = document.getElementById('error')

async function connect() {
  const url = input.value.trim()
  if (!url) {
    err.textContent = 'Please enter a server URL.'
    return
  }

  btn.disabled = true
  err.textContent = ''

  try {
    const result = await window.bool.setServerUrl(url)
    if (!result.ok) {
      err.textContent = result.error
    }
    // On success, main.ts closes this window and opens the server URL.
  } catch (e) {
    err.textContent = 'Unexpected error. Please try again.'
    console.error(e)
  } finally {
    btn.disabled = false
  }
}

btn.addEventListener('click', connect)
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') connect()
})
