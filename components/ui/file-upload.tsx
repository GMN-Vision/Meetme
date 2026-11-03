'use client'

import React, { useRef, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { IconUpload } from '@tabler/icons-react'
import { useDropzone } from 'react-dropzone'
import { cn } from '@/lib/utils'
import { useHoverCapable } from '@/hooks/useHoverCapable'

const mainVariant = {
  initial: { x: 0, y: 0 },
  animate: { x: 20, y: -20, opacity: 0.9 },
}

const secondaryVariant = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
}

export function FileUpload({ onChange, value, disabled = false, compact = false }: {
  onChange?: (files: File[]) => void
  value?: File | null
  disabled?: boolean
  compact?: boolean
}) {
  const [localFiles, setLocalFiles] = useState<File[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const reduceMotion = useReducedMotion()
  const canHover = useHoverCapable()
  const files = value === undefined ? localFiles : value ? [value] : []

  const handleFiles = (newFiles: File[]) => {
    if (disabled || !newFiles.length) return
    if (value === undefined) setLocalFiles(previous => [...previous, ...newFiles])
    onChange?.(newFiles)
  }

  const { getRootProps, isDragActive } = useDropzone({
    multiple: false,
    noClick: true,
    noKeyboard: true,
    disabled,
    onDrop: handleFiles,
  })

  const openPicker = () => { if (!disabled) inputRef.current?.click() }

  return <div className="w-full" {...getRootProps()}>
    <motion.div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label="Choose a file to share"
      aria-disabled={disabled}
      onClick={openPicker}
      onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openPicker() } }}
      animate={isDragActive && !reduceMotion ? 'animate' : 'initial'}
      whileHover={reduceMotion || disabled || !canHover ? undefined : 'animate'}
      className={cn('group/file relative block w-full overflow-hidden rounded-lg border border-dashed', isDragActive ? 'border-zinc-500 bg-zinc-800/30' : 'border-zinc-700', disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer', compact ? 'p-5' : 'p-10')}
    >
      <input
        ref={inputRef}
        type="file"
        disabled={disabled}
        onChange={event => { handleFiles(Array.from(event.target.files || [])); event.target.value = '' }}
        className="hidden"
        tabIndex={-1}
      />
      <div className="pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_center,white,transparent)]"><GridPattern /></div>
      <div className="flex flex-col items-center justify-center">
        <p className="relative z-20 font-sans text-base font-bold text-neutral-700 dark:text-neutral-300">Upload file</p>
        <p className={cn('relative z-20 mt-2 text-center font-sans font-normal text-neutral-400 dark:text-neutral-400', compact ? 'text-xs' : 'text-base')}>
          Drag or drop your file here or click to upload
        </p>
        <div className={cn('relative mx-auto w-full max-w-xl', compact ? 'mt-5' : 'mt-10')}>
          {files.map((file, index) => <motion.div
            key={`${file.name}-${file.lastModified}-${index}`}
            layoutId={index === 0 ? 'file-upload' : `file-upload-${index}`}
            className={cn('relative z-40 mx-auto mt-4 flex w-full flex-col items-start justify-start overflow-hidden rounded-md bg-white p-4 shadow-sm dark:bg-neutral-900', compact ? 'mt-2' : 'md:h-24')}
          >
            <div className="flex w-full items-center justify-between gap-4">
              <motion.p initial={reduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} layout={!reduceMotion} className="min-w-0 max-w-xs truncate text-base text-neutral-700 dark:text-neutral-300">{file.name}</motion.p>
              <motion.p initial={reduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} layout={!reduceMotion} className="shadow-input w-fit shrink-0 rounded-lg px-2 py-1 text-sm text-neutral-600 dark:bg-neutral-800 dark:text-white">{(file.size / (1024 * 1024)).toFixed(2)} MB</motion.p>
            </div>
            <div className="mt-2 flex w-full flex-col items-start justify-between text-sm text-neutral-600 dark:text-neutral-400 md:flex-row md:items-center">
              <motion.p initial={reduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} layout={!reduceMotion} className="max-w-full truncate rounded-md bg-gray-100 px-1 py-0.5 dark:bg-neutral-800">{file.type || 'File'}</motion.p>
              <motion.p initial={reduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} layout={!reduceMotion}>modified {new Date(file.lastModified).toLocaleDateString()}</motion.p>
            </div>
          </motion.div>)}
          {!files.length && <motion.div
            layoutId="file-upload"
            variants={mainVariant}
            transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 300, damping: 20 }}
            className={cn('relative z-40 mx-auto mt-4 flex w-full max-w-[8rem] items-center justify-center rounded-md bg-white shadow-[0px_10px_50px_rgba(0,0,0,0.1)] dark:bg-neutral-900', compact ? 'h-20' : 'h-32')}
          >
            {isDragActive ? <motion.p initial={reduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center text-neutral-600">Drop it<IconUpload className="h-4 w-4 text-neutral-600 dark:text-neutral-400" /></motion.p> : <IconUpload className="h-4 w-4 text-neutral-600 dark:text-neutral-300" />}
          </motion.div>}
          {!files.length && <motion.div variants={secondaryVariant} className={cn('absolute inset-0 z-30 mx-auto mt-4 flex w-full max-w-[8rem] items-center justify-center rounded-md border border-dashed border-zinc-500 bg-transparent opacity-0', compact ? 'h-20' : 'h-32')} />}
        </div>
      </div>
    </motion.div>
  </div>
}

export function GridPattern() {
  const columns = 41
  const rows = 11
  return <div className="flex shrink-0 scale-105 flex-wrap items-center justify-center gap-x-px gap-y-px bg-gray-100 dark:bg-neutral-900">
    {Array.from({ length: rows }).map((_, row) => Array.from({ length: columns }).map((_, col) => {
      const index = row * columns + col
      return <div key={`${col}-${row}`} className={`flex h-10 w-10 shrink-0 rounded-[2px] ${index % 2 === 0 ? 'bg-gray-50 dark:bg-neutral-950' : 'bg-gray-50 shadow-[0px_0px_1px_3px_rgba(255,255,255,1)_inset] dark:bg-neutral-950 dark:shadow-[0px_0px_1px_3px_rgba(0,0,0,1)_inset]'}`} />
    }))}
  </div>
}
