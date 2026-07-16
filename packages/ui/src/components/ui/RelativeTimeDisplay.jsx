import React, { useEffect, useState } from 'react'
import { formatRelativeTime } from '../../utils/time.js'

export default function RelativeTimeDisplay({ timestamp }) {
    const [, setNow] = useState(Date.now())

    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 60000)
        return () => clearInterval(timer)
    }, [])

    return formatRelativeTime(timestamp)
}
