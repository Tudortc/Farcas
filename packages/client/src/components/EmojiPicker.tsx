import data from '@emoji-mart/data'
import Picker from '@emoji-mart/react'

export interface EmojiPickerProps {
  onSelect: (emoji: string) => void
}

export function EmojiPicker({ onSelect }: EmojiPickerProps) {
  function handleEmojiSelect(emoji: { native: string }) {
    onSelect(emoji.native)
  }

  return (
    <Picker
      data={data}
      onEmojiSelect={handleEmojiSelect}
      theme="auto"
      set="native"
      previewPosition="none"
      skinTonePosition="none"
    />
  )
}
