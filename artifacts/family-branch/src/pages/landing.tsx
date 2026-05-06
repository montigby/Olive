import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { BookUser } from "lucide-react";

export default function Landing() {
  return (
    <div className="min-h-screen bg-[#FAF7F2] text-[#2D2D2D] font-sans selection:bg-[#C8DDD0]">
      <header className="px-6 py-6 md:px-12 md:py-8 flex justify-between items-center max-w-7xl mx-auto">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-[#4A7C59] flex items-center justify-center text-white">
            <BookUser className="w-4 h-4" />
          </div>
          <span className="font-serif font-bold text-2xl tracking-tight">Olive</span>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/login">
            <Button variant="ghost" className="font-medium text-[#6B6560] hover:text-[#2D2D2D]">Log In</Button>
          </Link>
          <Link href="/register">
            <Button className="bg-[#4A7C59] hover:bg-[#3d664a] text-white rounded-full px-6">Create Directory</Button>
          </Link>
        </div>
      </header>

      <main className="pt-20 pb-32 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="font-serif text-5xl md:text-7xl font-light leading-tight text-[#2D2D2D] mb-8">
            Your family, one place. <br/>
            <span className="italic text-[#4A7C59]">Always current.</span>
          </h1>
          <p className="text-xl md:text-2xl text-[#6B6560] max-w-2xl mx-auto leading-relaxed mb-12 font-light">
            The quiet center of your family's world. A warm, private place where grandmas find phone numbers, moms track who's where, and cousins finally know each other's birthdays.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/register">
              <Button size="lg" className="bg-[#4A7C59] hover:bg-[#3d664a] text-white rounded-full px-8 py-6 text-lg w-full sm:w-auto h-auto shadow-sm">
                Start your family tree
              </Button>
            </Link>
          </div>
        </div>

        <div className="mt-32 max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-12 text-center md:text-left">
          <div>
            <div className="w-12 h-12 rounded-full bg-[#EEF5F1] flex items-center justify-center mb-6 mx-auto md:mx-0">
              <span className="text-[#4A7C59] text-xl font-serif">1</span>
            </div>
            <h3 className="font-serif text-2xl font-semibold mb-3">Create your unit</h3>
            <p className="text-[#6B6560] leading-relaxed">Set up your immediate family. Add your partner, kids, and establish your home base.</p>
          </div>
          <div>
            <div className="w-12 h-12 rounded-full bg-[#EEF5F1] flex items-center justify-center mb-6 mx-auto md:mx-0">
              <span className="text-[#4A7C59] text-xl font-serif">2</span>
            </div>
            <h3 className="font-serif text-2xl font-semibold mb-3">Invite them in</h3>
            <p className="text-[#6B6560] leading-relaxed">Send secure invites. They claim their profiles and manage their own contact info.</p>
          </div>
          <div>
            <div className="w-12 h-12 rounded-full bg-[#EEF5F1] flex items-center justify-center mb-6 mx-auto md:mx-0">
              <span className="text-[#4A7C59] text-xl font-serif">3</span>
            </div>
            <h3 className="font-serif text-2xl font-semibold mb-3">Link branches</h3>
            <p className="text-[#6B6560] leading-relaxed">Connect to your parents' or siblings' units to build out the full extended family tree.</p>
          </div>
        </div>
      </main>
    </div>
  );
}
