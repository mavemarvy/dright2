import { useState, useRef, useEffect, useCallback } from 'react';
import { NavLink } from 'react-router-dom';
import { motion, AnimatePresence, useMotionValue, animate } from 'framer-motion';
import { MoreHorizontal, X } from 'lucide-react';

export interface ScrollableMenuItem {
  path: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface ScrollableMenuProps {
  items: ScrollableMenuItem[];
}

export default function ScrollableMenu({ items }: ScrollableMenuProps) {
  const [open, setOpen] = useState(false);
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [leftConstraint, setLeftConstraint] = useState(0);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const x = useMotionValue(0);

  // Keep scroll arrows in sync with x position
  useEffect(() => {
    return x.on('change', (val) => {
      setCanScrollLeft(val < -4);
      setCanScrollRight(val > leftConstraint + 4);
    });
  }, [x, leftConstraint]);

  const computeConstraints = useCallback(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;
    const overscroll = inner.scrollWidth - outer.clientWidth;
    const constraint = -Math.max(0, overscroll);
    setLeftConstraint(constraint);
    setCanScrollRight(overscroll > 4 && x.get() > constraint + 4);
    setCanScrollLeft(x.get() < -4);
  }, [x]);

  // Double rAF so the spring animation has settled and inner has its natural width
  useEffect(() => {
    if (!open) {
      x.set(0);
      setCanScrollLeft(false);
      setCanScrollRight(false);
      return;
    }
    let id1: number;
    let id2: number;
    id1 = requestAnimationFrame(() => {
      id2 = requestAnimationFrame(computeConstraints);
    });
    window.addEventListener('resize', computeConstraints);
    return () => {
      cancelAnimationFrame(id1);
      cancelAnimationFrame(id2);
      window.removeEventListener('resize', computeConstraints);
    };
  }, [open, computeConstraints, items.length, x]);

  const scrollStep = (dir: -1 | 1) => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;
    const overscroll = inner.scrollWidth - outer.clientWidth;
    const constraint = -Math.max(0, overscroll);
    const target = Math.max(constraint, Math.min(0, x.get() + dir * 200));
    animate(x, target, { type: 'spring', damping: 30, stiffness: 300 });
  };

  return (
    <>
      {/* 3-dot trigger button */}
      <button
        onClick={() => setOpen(true)}
        aria-label="Open navigation menu"
        className="p-2 -mr-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
      >
        <MoreHorizontal className="w-6 h-6" />
      </button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 bg-black/40 z-50 md:hidden"
            />
            <motion.div
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -20, opacity: 0 }}
              transition={{ type: 'spring', damping: 28, stiffness: 280 }}
              className="fixed top-0 left-0 right-0 z-50 bg-white shadow-xl md:hidden"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <span className="text-sm font-semibold text-gray-900">Navigate</span>
                <button
                  onClick={() => setOpen(false)}
                  className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Draggable nav strip */}
              <div className="relative">
                <AnimatePresence>
                  {canScrollLeft && (
                    <motion.button
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      onClick={() => scrollStep(1)}
                      aria-label="Scroll left"
                      className="absolute left-0 top-0 bottom-0 z-10 flex items-center pl-1 pr-3 bg-gradient-to-r from-white via-white/90 to-transparent"
                    >
                      <span className="w-7 h-7 flex items-center justify-center rounded-full bg-gray-100 text-gray-600 shadow-sm text-lg leading-none">
                        ‹
                      </span>
                    </motion.button>
                  )}
                </AnimatePresence>

                <AnimatePresence>
                  {canScrollRight && (
                    <motion.button
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      onClick={() => scrollStep(-1)}
                      aria-label="Scroll right"
                      className="absolute right-0 top-0 bottom-0 z-10 flex items-center pl-3 pr-1 bg-gradient-to-l from-white via-white/90 to-transparent"
                    >
                      <span className="w-7 h-7 flex items-center justify-center rounded-full bg-gray-100 text-gray-600 shadow-sm text-lg leading-none">
                        ›
                      </span>
                    </motion.button>
                  )}
                </AnimatePresence>

                <div ref={outerRef} className="overflow-hidden w-full">
                  <motion.div
                    ref={innerRef}
                    drag="x"
                    dragConstraints={{ left: leftConstraint, right: 0 }}
                    dragElastic={0.1}
                    dragMomentum
                    className="flex gap-2 px-3 py-3 cursor-grab active:cursor-grabbing select-none"
                    style={{ x, width: 'max-content' }}
                  >
                    {items.map((item, idx) => (
                      <NavLink
                        key={item.path}
                        to={item.path}
                        onClick={() => setOpen(false)}
                        draggable={false}
                        className={({ isActive }) =>
                          `shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm whitespace-nowrap transition-colors pointer-events-auto ${
                            isActive
                              ? 'bg-primary-50 text-primary-700 border border-primary-100'
                              : 'bg-gray-50 text-gray-700 hover:bg-gray-100 border border-transparent'
                          }`
                        }
                      >
                        <motion.span
                          initial={{ opacity: 0, x: 10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: Math.min(idx * 0.04, 0.32), duration: 0.2 }}
                          className="flex items-center gap-2"
                        >
                          <item.icon className="w-4 h-4" />
                          {item.label}
                        </motion.span>
                      </NavLink>
                    ))}
                  </motion.div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
