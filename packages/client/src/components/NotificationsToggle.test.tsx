import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'

// We mock the push-client module to control notificationState and spy on enablePush/disablePush
vi.mock('../push-client.js', () => ({
  pushSupported: vi.fn().mockReturnValue(true),
  notificationState: vi.fn(),
  enablePush: vi.fn().mockResolvedValue(true),
  disablePush: vi.fn().mockResolvedValue(undefined),
}))

import { notificationState, enablePush, disablePush } from '../push-client.js'
import { NotificationsToggle } from './NotificationsToggle.js'

const mockNotificationState = notificationState as ReturnType<typeof vi.fn>
const mockEnablePush = enablePush as ReturnType<typeof vi.fn>
const mockDisablePush = disablePush as ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
})

describe('NotificationsToggle', () => {
  it("renders an Enable button when state is 'default'", () => {
    mockNotificationState.mockReturnValue('default')
    render(<NotificationsToggle />)
    expect(screen.getByRole('button', { name: /enable notifications/i })).toBeInTheDocument()
  })

  it("clicking Enable calls enablePush when state is 'default'", async () => {
    mockNotificationState.mockReturnValue('default')
    render(<NotificationsToggle />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /enable notifications/i }))
    })
    expect(mockEnablePush).toHaveBeenCalledTimes(1)
  })

  it("renders 'Notifications on' and a disable action when state is 'granted'", () => {
    mockNotificationState.mockReturnValue('granted')
    render(<NotificationsToggle />)
    expect(screen.getByText(/notifications on/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /disable/i })).toBeInTheDocument()
  })

  it("clicking Disable calls disablePush when state is 'granted'", async () => {
    mockNotificationState.mockReturnValue('granted')
    render(<NotificationsToggle />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /disable/i }))
    })
    expect(mockDisablePush).toHaveBeenCalledTimes(1)
  })

  it("renders a blocked hint when state is 'denied'", () => {
    mockNotificationState.mockReturnValue('denied')
    render(<NotificationsToggle />)
    expect(screen.getByText(/blocked/i)).toBeInTheDocument()
    expect(screen.getByText(/browser settings/i)).toBeInTheDocument()
  })

  it("renders nothing when state is 'unsupported'", () => {
    mockNotificationState.mockReturnValue('unsupported')
    const { container } = render(<NotificationsToggle />)
    expect(container.firstChild).toBeNull()
  })
})
