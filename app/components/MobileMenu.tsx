"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronRight, LogOut, Menu, UserRound, X, type LucideIcon } from "lucide-react";

export type MenuLink = { href: string; label: string; icon: LucideIcon };

export default function MobileMenu({ links, address, logout, busy }: {
  links: MenuLink[]; address: string; logout: () => void; busy: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const wide = matchMedia("(min-width: 821px)");
    const sync = () => { if (wide.matches) dialog.current?.close(); };
    wide.addEventListener("change", sync);
    return () => wide.removeEventListener("change", sync);
  }, []);

  function openMenu() {
    dialog.current?.showModal();
    setOpen(true);
  }

  const active = address.split("#")[0];
  return <div className="mobile-menu">
    <button className="mobile-menu-trigger" type="button" onClick={openMenu} aria-label="Открыть меню"
      aria-haspopup="dialog" aria-controls="mobile-menu-dialog" aria-expanded={open}>
      <Menu size={21} aria-hidden="true"/>
    </button>
    <dialog className="mobile-menu-dialog" id="mobile-menu-dialog" ref={dialog} onClose={()=>setOpen(false)}
      aria-labelledby="mobile-menu-title" onClick={event=>{if(event.target===event.currentTarget) dialog.current?.close();}}>
      <div className="mobile-menu-sheet">
        <header><h2 id="mobile-menu-title">Меню</h2>
          <button type="button" className="mobile-menu-close" onClick={()=>dialog.current?.close()} aria-label="Закрыть меню" autoFocus>
            <X size={20} aria-hidden="true"/>
          </button>
        </header>
        <nav aria-label="Университет и профиль">
          {[{href:"/profile",label:"Мой профиль",icon:UserRound},...links].map(({href,label,icon:Icon})=>
            <a key={href} href={href} aria-current={active===href?"page":undefined} onClick={()=>dialog.current?.close()}>
              <span className="mobile-menu-icon"><Icon size={18} aria-hidden="true"/></span>
              <span>{label}</span><ChevronRight size={16} aria-hidden="true"/>
            </a>)}
        </nav>
        <button type="button" className="mobile-menu-logout" disabled={busy} onClick={logout}>
          <LogOut size={17} aria-hidden="true"/>{busy?"Выходим…":"Выйти из кабинета"}
        </button>
      </div>
    </dialog>
  </div>;
}
