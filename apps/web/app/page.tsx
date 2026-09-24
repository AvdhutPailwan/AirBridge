import { TransferUI } from "@/components/TransferUI"

export default function Page() {
  return (
    <div className="flex min-h-svh p-6 items-center justify-center bg-gradient-to-br from-[#E3FDFD] to-[#CBF1F5] dark:from-slate-950 dark:to-slate-900 transition-colors duration-500">
      <h1 className="sr-only">AirBridge - Free Peer-to-Peer Local Network File Sharing</h1>
      <div className="relative z-10 w-full">
        <TransferUI />
      </div>
    </div>
  )
}

