import React, { useEffect, useState, useRef, useMemo, useImperativeHandle, forwardRef } from 'react';
import { FileSystem } from '../services/fileSystem';
import { ZoomIn, ZoomOut, RotateCcw, Eye, EyeOff } from 'lucide-react';
import { resolveMapEntityName } from '../services/visibilityEngine';
import {
  buildPlayerRegistry,
  resolvePlayerIdentity,
  deduplicatePlayersOnMap,
  reconcileRegisteredPlayersOnMap,
  purgePlayerDuplicatesFromNpcs,
  cleanAndRepairPlayerFiles,
  reconcileHeldItemsOnMap,
  extractHeldItemsFromCharacterSheet,
  extractAllPossessionsFromCharacterSheet,
  areItemNamesEquivalent,
  HeldItemInfo
} from '../services/mapPlayerEngine';
import {
  resolveEntityFacing,
  resolveEntityVision,
  isEntityBlind,
  syncMapEntitiesVision
} from '../services/visionEngine';

interface MapPanelProps {
  fileSystem: FileSystem;
  files: string[];
  username: string;
  debugMode: boolean;
  syncCount: number;
}

export interface MapPanelHandle {
  captureScreenshot: () => Promise<string | null>;
}

const MapPanel = forwardRef<MapPanelHandle, MapPanelProps>(({ fileSystem, files, username, debugMode, syncCount }, ref) => {
  const [mapData, setMapData] = useState<any>(null);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [showAllLabels, setShowAllLabels] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('aimud_map_show_all_labels') === 'true';
    }
    return false;
  });

  const toggleShowAllLabels = () => {
    setShowAllLabels((prev) => {
      const next = !prev;
      if (typeof window !== 'undefined') {
        localStorage.setItem('aimud_map_show_all_labels', String(next));
      }
      return next;
    });
  };

  const dragStartPos = useRef({ x: 0, y: 0 });
  const panStartPos = useRef({ x: 0, y: 0 });
  const touchStartRef = useRef<{ x: number; y: number; dist?: number }>({ x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => ({
    captureScreenshot: async () => {
      const svgEl = svgRef.current;
      if (!svgEl) return null;

      let url = '';
      try {
        const serializer = new XMLSerializer();
        const svgString = serializer.serializeToString(svgEl);
        const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
        url = URL.createObjectURL(svgBlob);

        const img = new Image();
        img.crossOrigin = 'anonymous';

        // Add 800ms timeout race to prevent infinite hanging if image load fails to trigger
        const loaded = await Promise.race([
          new Promise<boolean>((resolve) => {
            img.onload = () => resolve(true);
            img.onerror = () => resolve(false);
            img.src = url;
          }),
          new Promise<boolean>((resolve) => {
            setTimeout(() => resolve(false), 800);
          })
        ]);

        if (!loaded) {
          if (url) URL.revokeObjectURL(url);
          return null;
        }

        const canvas = document.createElement('canvas');
        canvas.width = 800;
        canvas.height = 600;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          if (url) URL.revokeObjectURL(url);
          return null;
        }

        // Draw black background
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        URL.revokeObjectURL(url);
        url = '';
        const dataUrl = canvas.toDataURL('image/png');
        return dataUrl.split(',')[1] || null;
      } catch (e) {
        console.error('Failed to capture map screenshot:', e);
        return null;
      } finally {
        if (url) {
          try { URL.revokeObjectURL(url); } catch (_) {}
        }
      }
    }
  }));

  const playerRegistry = useMemo(() => {
    return buildPlayerRegistry(files, fileSystem);
  }, [files, fileSystem]);

  useEffect(() => {
    const content = fileSystem.read('CurrentMap.json');
    if (content) {
      try {
        const parsed = JSON.parse(content);
        setMapData(parsed);

        // Normalize pages to check if active player's page changed
        const currentPages = parsed?.pages && Array.isArray(parsed.pages)
          ? parsed.pages
          : Array.isArray(parsed)
            ? parsed
            : (parsed?.areas ? [parsed] : []);

        // Auto-switch to the page containing this active player if available (prefer latest page where player moved)
        if (username && currentPages.length > 0) {
          const userLower = username.toLowerCase();
          let targetIndex = -1;
          for (let i = currentPages.length - 1; i >= 0; i--) {
            if (currentPages[i].players?.some((pl: any) => {
              const res = resolvePlayerIdentity(pl, playerRegistry);
              return res.canonicalKey === userLower;
            })) {
              targetIndex = i;
              break;
            }
          }
          if (targetIndex !== -1) {
            setCurrentPageIndex(targetIndex);
          }
        }
      } catch (e) {
        console.error("Failed to parse CurrentMap.json", e);
      }
    } else {
      setMapData(null);
    }
  }, [fileSystem, files, syncCount, username, playerRegistry]);

  // Memoized set of all items, weapons, gear, containers, and vehicles in any character's sheet
  const allKnownPossessions = useMemo(() => {
    const possessions = new Set<string>();
    const registerPossession = (str: string) => {
      if (!str) return;
      const lower = str.trim().toLowerCase();
      if (!lower || lower.length < 2) return;
      possessions.add(lower);
      const unspaced = lower.replace(/[\s_-]+/g, '');
      if (unspaced.length >= 2) possessions.add(unspaced);
      const pascal = str.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
      if (pascal !== lower && pascal.length >= 2) possessions.add(pascal);
    };

    const allTxt = (files || []).filter(f => f.endsWith('.txt'));
    for (const f of allTxt) {
      if (
        f.startsWith('World') ||
        f.startsWith('Guide') ||
        f.startsWith('Log') ||
        f.startsWith('History') ||
        f.startsWith('Event') ||
        f.startsWith('Combat') ||
        f === 'CurrentMap.json'
      ) continue;
      const c = fileSystem.read(f);
      if (c) {
        extractAllPossessionsFromCharacterSheet(c).forEach(p => registerPossession(p));
        if (
          /category\s*[:=]\s*(?:item|equipment|gear|weapon|vehicle|mount|container|armor|tool|transport)/i.test(c) ||
          /(?:attached|equipped|hitched|towed|held|carried|riding)\s*(?:to|by)?\s*[:=]/i.test(c) ||
          /\[(?:IDENTIFICATION|TECHNICAL RULES|SPECIAL PROPERTIES|CONDITION & ACTIVE EFFECTS)\]/i.test(c)
        ) {
          const base = f.replace(/\.txt$/, '');
          registerPossession(base);
          const nameMatch = c.match(/[-*•]?\s*Name\s*[:=]\s*([^\n\r]+)/i);
          if (nameMatch && nameMatch[1]) {
            registerPossession(nameMatch[1].replace(/\[[^\]]+\]/g, ''));
          }
        }
      }
    }
    return possessions;
  }, [files, fileSystem, syncCount]);

  const isPossessionOfAnyone = (rawName: string): boolean => {
    if (!rawName) return false;
    const clean = rawName.toLowerCase().replace(/[-_]npc$/i, '').trim();
    if (!clean) return false;
    if (allKnownPossessions.has(clean)) return true;
    const unspaced = clean.replace(/[\s_-]+/g, '');
    if (allKnownPossessions.has(unspaced)) return true;
    const pascal = rawName.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().replace(/[-_]npc$/i, '').trim();
    if (allKnownPossessions.has(pascal)) return true;
    for (const p of allKnownPossessions) {
      if (clean === p || clean.includes(p) || p.includes(clean) || areItemNamesEquivalent(clean, p) || areItemNamesEquivalent(pascal, p)) {
        return true;
      }
    }
    return false;
  };

  // Robust multi-structure resolution for pages wrapped in useMemo to prevent massive lag during panning/zooming
  const pages = useMemo(() => {
    let rawPages: any[] = [];
    if (mapData?.pages && Array.isArray(mapData.pages)) {
      rawPages = mapData.pages;
    } else if (Array.isArray(mapData)) {
      rawPages = mapData;
    } else if (mapData?.areas) {
      rawPages = [{ name: 'World Map', ...mapData }];
    }

    // Deep clone to prevent mutating React state directly
    let pList: any[] = [];
    try {
      pList = JSON.parse(JSON.stringify(rawPages));
    } catch {
      pList = rawPages;
    }

    if (pList.length === 0) return pList;

    // Deduplicate and canonicalize players across and within pages using canonical identity registry
    deduplicatePlayersOnMap(pList, playerRegistry, { activeUsername: username });
    reconcileRegisteredPlayersOnMap(pList, playerRegistry);
    deduplicatePlayersOnMap(pList, playerRegistry, { activeUsername: username });

    // Inherit root-level entities to page 0 only if undefined on the page
    if (pList.length === 1) {
      const firstPage = pList[0];
      if (firstPage.players === undefined && Array.isArray(mapData?.players) && mapData.players.length > 0) {
        firstPage.players = mapData.players;
      }
      if (firstPage.items === undefined && Array.isArray(mapData?.items) && mapData.items.length > 0) {
        firstPage.items = mapData.items;
      }
      if (firstPage.landmarks === undefined && Array.isArray(mapData?.landmarks) && mapData.landmarks.length > 0) {
        firstPage.landmarks = mapData.landmarks;
      }
      if (firstPage.npcs === undefined && Array.isArray(mapData?.npcs) && mapData.npcs.length > 0) {
        firstPage.npcs = mapData.npcs;
      }
    }

    // Purge any player duplicates from NPCs list
    purgePlayerDuplicatesFromNpcs(pList, playerRegistry);

    // Reconcile and snap any held items with range that were placed far away back to their holder
    reconcileHeldItemsOnMap(pList, fileSystem, playerRegistry);

    // Synchronize and validate vision ranges and facing across all entities
    syncMapEntitiesVision({ pages: pList }, fileSystem);

    return pList;
  }, [mapData, playerRegistry, username, files, fileSystem, syncCount]);

  const safePageIndex = pages.length > 0 ? Math.max(0, Math.min(currentPageIndex, pages.length - 1)) : 0;

  // Auto-reset pan and zoom when changing pages
  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [safePageIndex]);

  // Window listeners to prevent stuck dragging state
  useEffect(() => {
    const handleGlobalUp = () => {
      setIsDragging(false);
    };
    window.addEventListener('mouseup', handleGlobalUp);
    window.addEventListener('touchend', handleGlobalUp);
    return () => {
      window.removeEventListener('mouseup', handleGlobalUp);
      window.removeEventListener('touchend', handleGlobalUp);
    };
  }, []);

  // Non-passive wheel event listener attached directly to the DOM node
  // This completely resolves the "Unable to preventDefault inside passive event listener invocation" error
  useEffect(() => {
    const el = mapContainerRef.current;
    if (!el) return;

    const handleWheelNative = (e: WheelEvent) => {
      if (e.cancelable) {
        e.preventDefault();
      }
      const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
      setZoom((prev) => Math.max(0.2, Math.min(8, +(prev * zoomFactor).toFixed(2))));
    };

    el.addEventListener('wheel', handleWheelNative, { passive: false });
    return () => {
      el.removeEventListener('wheel', handleWheelNative);
    };
  }, [pages.length, safePageIndex]);

  const currentPage = pages.length > 0 ? pages[safePageIndex] : null;

  // Aggregate all NPCs across pages, creatures, and entities (never duplicating area shapes as NPCs)
  const activeNpcs = useMemo(() => {
    if (!currentPage) return [];
    const rawNpcList = [
      ...(Array.isArray(currentPage?.npcs) ? currentPage.npcs : []),
      ...(Array.isArray(currentPage?.creatures) ? currentPage.creatures : []),
      ...(Array.isArray(currentPage?.entities) ? currentPage.entities : [])
    ];

    const list: any[] = [];
    const seenNpcKeys = new Set<string>();

    for (const n of rawNpcList) {
      if (!n) continue;
      const rawName = (n.name || n.id || 'NPC').trim();
      const cleanName = rawName.replace(/[-_]npc$/i, '').trim();
      const cleanLower = cleanName.toLowerCase();
      if (
        !cleanLower ||
        cleanLower === 'free hand' ||
        cleanLower === 'empty hand' ||
        cleanLower === 'bare hand' ||
        cleanLower === 'open hand' ||
        isPossessionOfAnyone(rawName) ||
        isPossessionOfAnyone(cleanName) ||
        n.attachedTo ||
        n.isHeld ||
        (n.holder && n.holder !== 'ground')
      ) {
        continue;
      }
      let name = rawName;
      if (!name.toLowerCase().endsWith('-npc')) {
        name = `${name}-npc`;
      }
      const key = name.toLowerCase();
      if (!seenNpcKeys.has(key)) {
        seenNpcKeys.add(key);
        list.push({
          ...n,
          name
        });
      }
    }
    return list;
  }, [currentPage, safePageIndex, pages.length]);

  // Calculate bounds to scale the map dynamically (memoized to prevent expensive geometry loop on pan/zoom)
  const { viewBox, mapWidth, mapHeight, padding, cx, cy } = useMemo(() => {
    if (!currentPage) {
      return { viewBox: '0 0 140 140', mapWidth: 100, mapHeight: 100, padding: 20, cx: 50, cy: 50 };
    }

    const isEntityHidden = (name: string) => {
      if (!name) return false;
      const res = resolveMapEntityName(name, username, debugMode);
      return res.isHidden;
    };

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    if (currentPage.areas && currentPage.areas.length > 0) {
      currentPage.areas.forEach((area: any) => {
        const isHidden = isEntityHidden(area.name);
        if (isHidden) return;

        const ax = Number(area.x ?? area.cx) || 0;
        const ay = Number(area.y ?? area.cy) || 0;
        const aw = Number(area.width) || 10;
        const ah = Number(area.height) || 10;
        const ar = Number(area.radius) || (aw / 2);
        const rx = Number(area.rx ?? area.radiusX ?? (aw / 2)) || 15;
        const ry = Number(area.ry ?? area.radiusY ?? (ah / 2)) || 10;

        if (area.shape === 'circle') {
          if (ax - ar < minX) minX = ax - ar;
          if (ay - ar < minY) minY = ay - ar;
          if (ax + ar > maxX) maxX = ax + ar;
          if (ay + ar > maxY) maxY = ay + ar;
        } else if (area.shape === 'ellipse' || area.shape === 'oblong') {
          const rot = Number(area.rotation) || 0;
          const rad = (rot * Math.PI) / 180;
          const dx = Math.sqrt(rx * rx * Math.cos(rad) * Math.cos(rad) + ry * ry * Math.sin(rad) * Math.sin(rad));
          const dy = Math.sqrt(rx * rx * Math.sin(rad) * Math.sin(rad) + ry * ry * Math.cos(rad) * Math.cos(rad));
          if (ax - dx < minX) minX = ax - dx;
          if (ay - dy < minY) minY = ay - dy;
          if (ax + dx > maxX) maxX = ax + dx;
          if (ay + dy > maxY) maxY = ay + dy;
        } else if (area.shape === 'polygon' && area.points) {
          const pts = String(area.points).split(/[\s,]+/).map(Number).filter((n: number) => !isNaN(n));
          const numPoints = Math.floor(pts.length / 2);
          for (let j = 0; j < numPoints * 2; j += 2) {
            const px = pts[j];
            const py = pts[j + 1];
            if (px < minX) minX = px;
            if (py < minY) minY = py;
            if (px > maxX) maxX = px;
            if (py > maxY) maxY = py;
          }
        } else if (area.shape === 'path' && area.d) {
          const matches = String(area.d).match(/-?\d+(\.\d+)?/g);
          if (matches) {
            const nums = matches.map(Number);
            for (let j = 0; j < nums.length - 1; j += 2) {
              const px = nums[j];
              const py = nums[j + 1];
              if (!isNaN(px) && px < minX) minX = px;
              if (!isNaN(py) && py < minY) minY = py;
              if (!isNaN(px) && px > maxX) maxX = px;
              if (!isNaN(py) && py > maxY) maxY = py;
            }
          }
        } else {
          if (ax < minX) minX = ax;
          if (ay < minY) minY = ay;
          if (ax + aw > maxX) maxX = ax + aw;
          if (ay + ah > maxY) maxY = ay + ah;
        }
      });
    }

    if (currentPage.players && currentPage.players.length > 0) {
      currentPage.players.forEach((p: any) => {
        const px = Number(p.x) || 0;
        const py = Number(p.y) || 0;
        if (px < minX) minX = px;
        if (py < minY) minY = py;
        if (px > maxX) maxX = px;
        if (py > maxY) maxY = py;
      });
    }

    if (currentPage.items && Array.isArray(currentPage.items)) {
      currentPage.items.forEach((it: any) => {
        if (isEntityHidden(it.name)) return;
        const ix = Number(it.x) || 0;
        const iy = Number(it.y) || 0;
        if (ix < minX) minX = ix;
        if (iy < minY) minY = iy;
        if (ix > maxX) maxX = ix;
        if (iy > maxY) maxY = iy;
      });
    }

    if (currentPage.landmarks && Array.isArray(currentPage.landmarks)) {
      currentPage.landmarks.forEach((lm: any) => {
        if (isEntityHidden(lm.name)) return;
        const lx = Number(lm.x) || 0;
        const ly = Number(lm.y) || 0;
        if (lx < minX) minX = lx;
        if (ly < minY) minY = ly;
        if (lx > maxX) maxX = lx;
        if (ly > maxY) maxY = ly;
      });
    }

    if (activeNpcs && activeNpcs.length > 0) {
      activeNpcs.forEach((npc: any) => {
        if (isEntityHidden(npc.name)) return;
        const nx = Number(npc.x) || 0;
        const ny = Number(npc.y) || 0;
        if (nx < minX) minX = nx;
        if (ny < minY) minY = ny;
        if (nx > maxX) maxX = nx;
        if (ny > maxY) maxY = ny;
      });
    }

    if (currentPage.notes && Array.isArray(currentPage.notes)) {
      currentPage.notes.forEach((note: any) => {
        const nx = Number(note.x) || 0;
        const ny = Number(note.y) || 0;
        if (nx < minX) minX = nx;
        if (ny < minY) minY = ny;
        if (nx > maxX) maxX = nx;
        if (ny > maxY) maxY = ny;
      });
    }

    if (minX === Infinity || isNaN(minX) || isNaN(maxX) || isNaN(minY) || isNaN(maxY)) {
      minX = 0; minY = 0; maxX = 100; maxY = 100;
    }

    const mW = Math.max(maxX - minX, 100);
    const mH = Math.max(maxY - minY, 100);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const finalMinX = cx - mW / 2;
    const finalMinY = cy - mH / 2;
    const pad = 20;
    const vb = `${finalMinX - pad} ${finalMinY - pad} ${mW + pad * 2} ${mH + pad * 2}`;
    return { viewBox: vb, mapWidth: mW, mapHeight: mH, padding: pad, cx, cy };
  }, [currentPage, activeNpcs, username, debugMode]);

  // RAF reference to prevent high-frequency layout thrashing during pan
  const panRafRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (panRafRef.current) cancelAnimationFrame(panRafRef.current);
    };
  }, []);

  // Pan and Zoom Handlers
  const handleResetPanZoom = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const handleZoomIn = () => {
    setZoom((prev) => Math.min(8, +(prev * 1.3).toFixed(2)));
  };

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(0.2, +(prev / 1.3).toFixed(2)));
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // Only primary button
    setIsDragging(true);
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    panStartPos.current = { ...pan };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    const clientX = e.clientX;
    const clientY = e.clientY;
    if (panRafRef.current) cancelAnimationFrame(panRafRef.current);
    panRafRef.current = requestAnimationFrame(() => {
      const dx = clientX - dragStartPos.current.x;
      const dy = clientY - dragStartPos.current.y;
      const svgEl = svgRef.current;
      if (svgEl) {
        const rect = svgEl.getBoundingClientRect();
        const viewBoxWidth = mapWidth + padding * 2;
        const viewBoxHeight = mapHeight + padding * 2;
        const scaleX = (viewBoxWidth / (rect.width || 1)) / zoom;
        const scaleY = (viewBoxHeight / (rect.height || 1)) / zoom;
        setPan({
          x: panStartPos.current.x + dx * scaleX,
          y: panStartPos.current.y + dy * scaleY
        });
      } else {
        setPan({
          x: panStartPos.current.x + dx,
          y: panStartPos.current.y + dy
        });
      }
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      setIsDragging(true);
      touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      panStartPos.current = { ...pan };
    } else if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      touchStartRef.current = {
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
        dist
      };
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 1 && isDragging) {
      const clientX = e.touches[0].clientX;
      const clientY = e.touches[0].clientY;
      if (panRafRef.current) cancelAnimationFrame(panRafRef.current);
      panRafRef.current = requestAnimationFrame(() => {
        const dx = clientX - touchStartRef.current.x;
        const dy = clientY - touchStartRef.current.y;
        const svgEl = svgRef.current;
        if (svgEl) {
          const rect = svgEl.getBoundingClientRect();
          const viewBoxWidth = mapWidth + padding * 2;
          const viewBoxHeight = mapHeight + padding * 2;
          const scaleX = (viewBoxWidth / (rect.width || 1)) / zoom;
          const scaleY = (viewBoxHeight / (rect.height || 1)) / zoom;
          setPan({
            x: panStartPos.current.x + dx * scaleX,
            y: panStartPos.current.y + dy * scaleY
          });
        }
      });
    } else if (e.touches.length === 2 && touchStartRef.current.dist) {
      const newDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const factor = newDist / touchStartRef.current.dist;
      setZoom((prev) => Math.max(0.2, Math.min(8, +(prev * factor).toFixed(2))));
      touchStartRef.current.dist = newDist;
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
  };

  if (!currentPage) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 italic p-4 text-center bg-black">
        Map data unavailable. The AI engine is generating the world...
      </div>
    );
  }

  if (!currentPage.areas) {
    currentPage.areas = [];
  }

  const parseName = (name: string) => {
    if (!name) return 'Unknown Area';
    const res = resolveMapEntityName(name, username, debugMode);
    return res.displayName;
  };

  const parseNpcName = (name: string) => {
    if (!name) return 'NPC-npc';
    const res = resolveMapEntityName(name, username, debugMode);
    let displayName = res.displayName;
    if (displayName && !displayName.toLowerCase().endsWith('-npc')) {
      displayName = `${displayName}-npc`;
    }
    return displayName;
  };

  const isEntityHidden = (name: string) => {
    if (!name) return false;
    const res = resolveMapEntityName(name, username, debugMode);
    return res.isHidden;
  };

  const getAreaColor = (type: string, visible: boolean) => {
    if (visible === false) {
      return 'fill-neutral-900/50 stroke-neutral-800';
    }
    switch (type?.toLowerCase()) {
      case 'market':
      case 'bazaar':
      case 'square':
      case 'plaza':
        return 'fill-amber-950/40 stroke-amber-500/80';
      case 'stall':
      case 'shop':
      case 'store':
      case 'merchant':
      case 'counter':
        return 'fill-amber-700/60 stroke-amber-400';
      case 'building':
      case 'house':
      case 'structure':
      case 'inn':
      case 'tavern':
        return 'fill-neutral-700/70 stroke-neutral-400';
      case 'wall':
      case 'gate':
      case 'fence':
      case 'barrier':
        return 'fill-neutral-600/80 stroke-neutral-300';
      case 'road':
      case 'path':
      case 'trail':
      case 'street':
      case 'bridge':
      case 'corridor':
      case 'hallway':
        return 'fill-stone-800/60 stroke-stone-500';
      case 'field':
      case 'forest':
      case 'wood':
      case 'jungle':
      case 'grove':
        return 'fill-emerald-950/60 stroke-emerald-700';
      case 'tree':
      case 'bush':
      case 'vegetation':
        return 'fill-green-800/60 stroke-green-500';
      case 'clearing':
      case 'meadow':
      case 'grass':
        return 'fill-green-950/40 stroke-green-700';
      case 'water':
      case 'river':
      case 'lake':
      case 'pond':
      case 'ocean':
      case 'stream':
        return 'fill-blue-900/50 stroke-blue-500';
      case 'room':
      case 'dungeon':
      case 'chamber':
        return 'fill-neutral-800/80 stroke-neutral-500';
      case 'obstacle':
        return 'fill-neutral-600/80 stroke-neutral-400';
      case 'furniture':
        return 'fill-amber-900/60 stroke-amber-700';
      case 'npc':
      case 'enemy':
      case 'ally':
      case 'creature':
      case 'boss':
        return 'fill-purple-900/70 stroke-purple-400';
      case 'vehicle':
      case 'cart':
      case 'wagon':
        return 'fill-slate-700/80 stroke-slate-400';
      case 'projectile':
        return 'fill-red-500/80 stroke-red-300';
      case 'fire':
      case 'lava':
        return 'fill-orange-600/60 stroke-orange-400 animate-pulse';
      case 'poison':
      case 'acid':
        return 'fill-lime-600/40 stroke-lime-400';
      case 'treasure':
      case 'loot':
      case 'item':
      case 'weapon':
      case 'equipment':
        return 'fill-yellow-400/70 stroke-yellow-200';
      case 'landmark':
      case 'monument':
      case 'statue':
      case 'fountain':
      case 'shrine':
        return 'fill-indigo-900/60 stroke-indigo-400';
      case 'tech':
      case 'terminal':
        return 'fill-cyan-900/60 stroke-cyan-400 shadow-[0_0_5px_rgba(34,211,238,0.5)]';
      case 'magic':
      case 'portal':
        return 'fill-purple-900/60 stroke-purple-400 animate-pulse';
      case 'nature':
      case 'hazard':
        return 'fill-amber-950/40 stroke-amber-800';
      default:
        return 'fill-neutral-800/40 stroke-neutral-600';
    }
  };

  const createConePath = (x: number, y: number, facing: number, paramAngle: number, radius: number) => {
    if (!radius || radius <= 0 || !paramAngle || paramAngle <= 0) return '';
    let angle = Math.abs(paramAngle) / 2;
    if (angle >= 180) angle = 179.99;

    const startAngle = (facing - angle) * Math.PI / 180;
    const endAngle = (facing + angle) * Math.PI / 180;

    const startX = x + radius * Math.cos(startAngle);
    const startY = y + radius * Math.sin(startAngle);

    const endX = x + radius * Math.cos(endAngle);
    const endY = y + radius * Math.sin(endAngle);

    const largeArcFlag = angle * 2 > 180 ? 1 : 0;

    return `M ${x} ${y} L ${startX} ${startY} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${endX} ${endY} Z`;
  };

  const primaryPlayer = (() => {
    if (!currentPage?.players || currentPage.players.length === 0) return null;
    const userLower = (username || '').toLowerCase();
    const me = currentPage.players.find((p: any) => {
      const res = resolvePlayerIdentity(p, playerRegistry);
      return res.canonicalKey === userLower;
    });
    const chosen = me || currentPage.players[0];
    return chosen ? { x: Number(chosen.x) || 0, y: Number(chosen.y) || 0 } : null;
  })();

  // Text scale counteracts zoom to keep text labels the exact same screen size regardless of zooming in/out
  const textScale = zoom > 0 ? +(1 / zoom).toFixed(4) : 1;

  if (pages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-500 italic p-6 text-center gap-4 bg-black">
        <div className="w-12 h-12 border-2 border-dashed border-gray-800 rounded-full animate-spin-slow flex items-center justify-center text-xl">🗺️</div>
        <div>
          <p className="font-bold text-gray-400 not-italic">NO ACTIVE MAP DATA</p>
          <p className="mt-1 text-[10px]">The AI engine generates the world as you move.</p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={mapContainerRef}
      id="map-viewport"
      className={`flex flex-col h-full w-full bg-black relative overflow-hidden select-none touch-none ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onDoubleClick={handleResetPanZoom}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Top Left Pages Bar */}
      {pages.length > 1 && (
        <div className="absolute top-2 left-2 flex gap-1 z-20 pointer-events-auto flex-wrap max-w-[calc(100%-260px)]">
          {pages.map((p, idx) => {
            const pagePlayerCount = p.players?.length || 0;
            return (
              <button
                key={idx}
                type="button"
                onClick={() => setCurrentPageIndex(idx)}
                className={`text-[10px] font-mono px-2 py-1 rounded border transition-colors flex items-center gap-1 ${idx === safePageIndex
                  ? 'bg-blue-900/50 border-blue-500 text-blue-200 shadow-[0_0_10px_rgba(59,130,246,0.3)] font-bold'
                  : 'bg-black/70 border-neutral-800 text-gray-400 hover:bg-neutral-800'
                  }`}
              >
                <span>{p.name || `Page ${idx + 1}`}</span>
                {pagePlayerCount > 0 && (
                  <span className="text-[8px] bg-blue-500/20 text-blue-300 px-1 rounded-full border border-blue-500/40">
                    {pagePlayerCount}👤
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Top Right Zoom, Pan and Labels Controls with Scale Directly Underneath */}
      <div className="absolute top-2 right-2 flex flex-col items-end gap-1.5 z-20 pointer-events-none">
        <div className="flex items-center gap-1.5 bg-black/85 backdrop-blur-sm border border-neutral-800 rounded-lg p-1 px-1.5 shadow-lg select-none pointer-events-auto">
          <button
            type="button"
            id="map-zoom-out-btn"
            onClick={(e) => { e.stopPropagation(); handleZoomOut(); }}
            title="Zoom Out (-)"
            className="p-1 rounded text-gray-300 hover:text-white hover:bg-neutral-800 transition-colors"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="text-[10px] font-mono text-gray-300 min-w-[36px] text-center font-medium">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            id="map-zoom-in-btn"
            onClick={(e) => { e.stopPropagation(); handleZoomIn(); }}
            title="Zoom In (+)"
            className="p-1 rounded text-gray-300 hover:text-white hover:bg-neutral-800 transition-colors"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <div className="w-[1px] h-3.5 bg-neutral-700 mx-0.5" />
          <button
            type="button"
            id="map-reset-btn"
            onClick={(e) => { e.stopPropagation(); handleResetPanZoom(); }}
            title="Reset Pan & Zoom (100% / Centered)"
            className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-mono text-blue-400 hover:text-blue-200 hover:bg-blue-900/40 rounded border border-blue-900/40 transition-colors"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reset</span>
          </button>
          <div className="w-[1px] h-3.5 bg-neutral-700 mx-0.5" />
          <button
            type="button"
            id="map-toggle-labels-btn"
            onClick={(e) => { e.stopPropagation(); toggleShowAllLabels(); }}
            title={showAllLabels ? "Labels: Always showing all (click to switch to hover-only)" : "Labels: Showing on hover only (click to show all labels)"}
            className={`flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-mono rounded border transition-colors ${
              showAllLabels
                ? 'bg-blue-950/80 text-blue-300 border-blue-600/70 shadow-[0_0_8px_rgba(59,130,246,0.3)]'
                : 'text-neutral-400 hover:text-white hover:bg-neutral-800 border-neutral-800'
            }`}
          >
            {showAllLabels ? <Eye className="w-3 h-3 text-blue-400" /> : <EyeOff className="w-3 h-3 text-neutral-400" />}
            <span>{showAllLabels ? 'All Text' : 'Hover Text'}</span>
          </button>
        </div>

        {/* Meters Scale: Positioned under the map buttons so it is never hidden */}
        <div className="bg-black/90 text-[10px] text-blue-400 font-mono px-2 py-0.5 rounded border border-blue-900/60 backdrop-blur-xs shadow-md flex items-center gap-1.5 select-none pointer-events-none">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
          <span>Scale: {currentPage.scale || 'Unknown'}</span>
        </div>
      </div>

      {/* Bottom Hint on Drag/Zoom */}
      <div className="absolute bottom-2 right-2 z-10 pointer-events-none bg-black/75 text-[9px] font-mono text-gray-400 px-2 py-0.5 rounded border border-neutral-800/80 backdrop-blur-xs">
        {showAllLabels ? 'Showing all labels • Scroll to zoom' : 'Hover elements for text labels • Scroll to zoom'}
      </div>

      <svg
        ref={svgRef}
        className="w-full h-full"
        viewBox={viewBox}
        preserveAspectRatio="xMidYMid meet"
      >
        <g
          id="map-transform-layer"
          transform={`translate(${cx}, ${cy}) translate(${pan.x * zoom}, ${pan.y * zoom}) scale(${zoom}) translate(${-cx}, ${-cy})`}
        >
          {/* Draw Areas & Structures */}
          {currentPage.areas?.map((area: any, i: number) => {
            const isHidden = isEntityHidden(area.name);
            if (isHidden) return null;
            const parsedName = parseName(area.name);

            const ax = Number(area.x ?? area.cx) || 0;
            const ay = Number(area.y ?? area.cy) || 0;
            const aw = Number(area.width) || 10;
            const ah = Number(area.height) || 10;
            const ar = Number(area.radius) || (aw / 2);
            const rx = Number(area.rx ?? area.radiusX ?? (aw / 2)) || 15;
            const ry = Number(area.ry ?? area.radiusY ?? (ah / 2)) || 10;

            let textX = ax + aw / 2;
            let textY = ay + ah / 2;

            if (area.shape === 'circle') {
              textX = ax;
              textY = ay;
            } else if (area.shape === 'ellipse' || area.shape === 'oblong') {
              textX = ax;
              textY = ay;
            } else if (area.shape === 'polygon' && area.points) {
              const pts = String(area.points).split(/[\s,]+/).map(Number).filter((n: number) => !isNaN(n));
              const numPoints = Math.floor(pts.length / 2);
              if (numPoints >= 1) {
                let sumX = 0, sumY = 0;
                for (let j = 0; j < numPoints * 2; j += 2) {
                  sumX += pts[j];
                  sumY += pts[j + 1];
                }
                textX = sumX / numPoints;
                textY = sumY / numPoints;
              }
            } else if (area.shape === 'path' && area.d) {
              const matches = String(area.d).match(/-?\d+(\.\d+)?/g);
              if (matches && matches.length >= 2) {
                const nums = matches.map(Number);
                let sumX = 0, sumY = 0, count = 0;
                for (let j = 0; j < nums.length - 1; j += 2) {
                  if (!isNaN(nums[j]) && !isNaN(nums[j + 1])) {
                    sumX += nums[j];
                    sumY += nums[j + 1];
                    count++;
                  }
                }
                if (count > 0) {
                  textX = sumX / count;
                  textY = sumY / count;
                }
              }
            }

            const areaTypeLower = String(area.type || '').toLowerCase();
            const areaNameLower = String(area.name || '').toLowerCase();
            const isItemType = areaTypeLower === 'item' || areaTypeLower === 'loot' || areaTypeLower === 'weapon' || areaTypeLower === 'treasure' || areaTypeLower === 'equipment' || areaTypeLower === 'vehicle' || areaTypeLower === 'transport' || areaTypeLower === 'mount';
            const isItemOrWeaponType = isItemType || areaTypeLower === 'range' || areaTypeLower === 'weapon_range';

            // If area is marked held or attached to an entity, or belongs to a character's held/equipped gear, do not draw it loose on ground
            if (area.isHeld || area.attachedTo || (area.holder && area.holder !== 'ground') || isPossessionOfAnyone(area.name)) return null;

            // If area represents an item or weapon range that is currently held by any player or NPC, suppress loose rendering
            if (isItemOrWeaponType || areaNameLower.includes('range') || areaNameLower.includes('reach')) {
              const matchesHeld = (currentPage.players || []).some((pl: any) =>
                (pl.heldItems || []).some((hi: any) => {
                  const hiClean = (hi.cleanName || hi.name || '').toLowerCase();
                  return hiClean && (areaNameLower.includes(hiClean) || hiClean.includes(areaNameLower));
                }) || (pl.allPossessions || []).some((pos: string) =>
                  areaNameLower === pos || areaNameLower.includes(pos) || pos.includes(areaNameLower)
                )
              ) || (currentPage.npcs || []).some((npc: any) =>
                (npc.heldItems || []).some((hi: any) => {
                  const hiClean = (hi.cleanName || hi.name || '').toLowerCase();
                  return hiClean && (areaNameLower.includes(hiClean) || hiClean.includes(areaNameLower));
                }) || (npc.allPossessions || []).some((pos: string) =>
                  areaNameLower === pos || areaNameLower.includes(pos) || pos.includes(areaNameLower)
                )
              );
              if (matchesHeld) return null;
            }

            return (
              <g key={area.id || i} className="group">
                {area.shape === 'circle' ? (
                  <circle
                    cx={ax}
                    cy={ay}
                    r={ar}
                    className={`${getAreaColor(area.type, area.visible)} transition-colors duration-300 hover:fill-opacity-80 cursor-crosshair`}
                    strokeWidth={2}
                  />
                ) : (area.shape === 'ellipse' || area.shape === 'oblong') ? (
                  <ellipse
                    cx={ax}
                    cy={ay}
                    rx={rx}
                    ry={ry}
                    transform={area.rotation ? `rotate(${area.rotation} ${ax} ${ay})` : undefined}
                    className={`${getAreaColor(area.type, area.visible)} transition-colors duration-300 hover:fill-opacity-80 cursor-crosshair`}
                    strokeWidth={2}
                  />
                ) : area.shape === 'polygon' && area.points ? (
                  <polygon
                    points={area.points}
                    className={`${getAreaColor(area.type, area.visible)} transition-colors duration-300 hover:fill-opacity-80 cursor-crosshair`}
                    strokeWidth={2}
                  />
                ) : area.shape === 'path' && area.d ? (
                  <path
                    d={area.d}
                    className={`${getAreaColor(area.type, area.visible)} transition-colors duration-300 hover:fill-opacity-80 cursor-crosshair`}
                    strokeWidth={Number(area.strokeWidth) || 2}
                    fill={area.fill || 'none'}
                  />
                ) : (
                  <rect
                    x={ax}
                    y={ay}
                    width={aw}
                    height={ah}
                    rx={Number(area.rx) || 0}
                    ry={Number(area.ry) || 0}
                    transform={area.rotation ? `rotate(${area.rotation} ${ax + aw / 2} ${ay + ah / 2})` : undefined}
                    className={`${getAreaColor(area.type, area.visible)} transition-colors duration-300 hover:fill-opacity-80 cursor-crosshair`}
                    strokeWidth={2}
                  />
                )}

                {/* Status/Effect glow for active elements (e.g. lit torches, fire, active magic) */}
                {(() => {
                  const statusText = area.status || area.condition || (Array.isArray(area.effects) && area.effects.length > 0 ? area.effects.join(', ') : '');
                  const isLit = String(statusText || area.type || '').toLowerCase().includes('lit') || String(statusText || '').toLowerCase().includes('fire') || String(statusText || '').toLowerCase().includes('burning');
                  if (!isLit) return null;
                  return (
                    <circle
                      cx={textX}
                      cy={textY}
                      r={7}
                      className="fill-amber-400/25 stroke-amber-400/50 animate-pulse pointer-events-none"
                      strokeWidth={0.75}
                    />
                  );
                })()}

                {/* Highlight marker for loose items/weapons on ground */}
                {isItemType && (
                  <polygon
                    points={`${textX},${textY - 3} ${textX + 3},${textY} ${textX},${textY + 3} ${textX - 3},${textY}`}
                    className="fill-yellow-300 stroke-yellow-500 animate-pulse pointer-events-none"
                    strokeWidth={1}
                  />
                )}

                {/* Tooltip on hover */}
                {(() => {
                  const statusText = area.status || area.condition || (Array.isArray(area.effects) && area.effects.length > 0 ? area.effects.join(', ') : '');
                  return (
                    <title>{`${parsedName}${area.type ? ` (${area.type})` : ''}${statusText ? ` [${statusText}]` : ''}`}</title>
                  );
                })()}

                {/* Area Label - shows on hover over area or text, or always if showAllLabels is active; scale(textScale) keeps size constant on zoom */}
                {parsedName && (() => {
                  const statusText = area.status || area.condition || (Array.isArray(area.effects) && area.effects.length > 0 ? area.effects.join(', ') : '');
                  const isLit = String(statusText || area.type || '').toLowerCase().includes('lit') || String(statusText || '').toLowerCase().includes('fire');
                  const isBroken = String(statusText || '').toLowerCase().includes('broken') || String(statusText || '').toLowerCase().includes('jammed');

                  return (
                    <g
                      transform={`translate(${textX}, ${textY}) scale(${textScale})`}
                      className={`pointer-events-auto transition-opacity duration-150 ${
                        showAllLabels ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                      }`}
                    >
                      <text
                        x={0}
                        y={0}
                        textAnchor="middle"
                        dominantBaseline="central"
                        className={`text-[6px] font-mono font-medium select-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)] ${
                          isItemType
                            ? 'fill-yellow-300 font-bold'
                            : 'fill-gray-200'
                        }`}
                        style={{ paintOrder: 'stroke fill', stroke: '#000000', strokeWidth: '2px', strokeLinejoin: 'round' }}
                      >
                        {parsedName}
                        {statusText && (
                          <tspan className={isLit ? "fill-amber-300 font-semibold" : isBroken ? "fill-red-300 italic" : "fill-cyan-300"}>
                            {` [${statusText}]`}
                          </tspan>
                        )}
                      </text>
                    </g>
                  );
                })()}
              </g>
            );
          })}

          {/* Draw Top-Level Items (if separately registered on page) */}
          {currentPage.items?.map((item: any, i: number) => {
            if (isEntityHidden(item.name)) return null;
            const rawItemName = String(item.name || '').trim();
            const itemNameLower = rawItemName.toLowerCase();
            if (
              !itemNameLower ||
              itemNameLower === 'free hand' ||
              itemNameLower === 'empty hand' ||
              itemNameLower === 'bare hand' ||
              itemNameLower === 'open hand'
            ) return null;
            // If item is held by a player or NPC, or attached, it is on their person, not loose on ground!
            if (
              item.isHeld ||
              item.attachedTo ||
              (item.holder && item.holder !== 'ground') ||
              isPossessionOfAnyone(item.name) ||
              isPossessionOfAnyone(String(item.name).replace(/([a-z])([A-Z])/g, '$1 $2')) ||
              isPossessionOfAnyone(String(item.name).replace(/[\s_-]+/g, ''))
            ) return null;
            const matchesHeldItem = (currentPage.players || []).some((pl: any) =>
              (pl.heldItems || []).some((hi: any) => {
                const hiClean = (hi.cleanName || hi.name || '').toLowerCase();
                return hiClean && (itemNameLower.includes(hiClean) || hiClean.includes(itemNameLower));
              }) || (pl.allPossessions || []).some((pos: string) =>
                itemNameLower === pos || itemNameLower.includes(pos) || pos.includes(itemNameLower)
              )
            ) || (currentPage.npcs || []).some((npc: any) =>
              (npc.heldItems || []).some((hi: any) => {
                const hiClean = (hi.cleanName || hi.name || '').toLowerCase();
                return hiClean && (itemNameLower.includes(hiClean) || hiClean.includes(itemNameLower));
              }) || (npc.allPossessions || []).some((pos: string) =>
                itemNameLower === pos || itemNameLower.includes(pos) || pos.includes(itemNameLower)
              )
            );
            if (matchesHeldItem) return null;
            const ix = Number(item.x) || 0;
            const iy = Number(item.y) || 0;
            const iName = parseName(item.name || 'Item');
            const itemStatus = item.status || item.condition || (Array.isArray(item.effects) && item.effects.length > 0 ? item.effects.join(', ') : '');
            const isLit = String(itemStatus || item.name || '').toLowerCase().includes('lit') || String(itemStatus || '').toLowerCase().includes('fire') || String(itemStatus || '').toLowerCase().includes('burning');

            return (
              <g key={`page-item-${i}`} className="group cursor-crosshair">
                {isLit && (
                  <circle
                    cx={ix}
                    cy={iy}
                    r={6}
                    className="fill-amber-400/30 stroke-amber-400/60 animate-pulse pointer-events-none"
                    strokeWidth={0.75}
                  />
                )}
                <polygon
                  points={`${ix},${iy - 3.5} ${ix + 3.5},${iy} ${ix},${iy + 3.5} ${ix - 3.5},${iy}`}
                  className="fill-yellow-400 stroke-yellow-200 animate-pulse"
                  strokeWidth={1}
                />
                <title>{`${iName}${itemStatus ? ` [${itemStatus}]` : ''} (Item: ${item.description || ''})`}</title>
                <g
                  transform={`translate(${ix}, ${iy}) scale(${textScale})`}
                  className={`pointer-events-auto transition-opacity duration-150 ${
                    showAllLabels ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                  }`}
                >
                  <text
                    x={0}
                    y={-6}
                    textAnchor="middle"
                    dominantBaseline="central"
                    className="fill-yellow-300 text-[5px] font-mono font-bold select-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]"
                    style={{ paintOrder: 'stroke fill', stroke: '#000000', strokeWidth: '2px', strokeLinejoin: 'round' }}
                  >
                    {iName}
                    {itemStatus && (
                      <tspan className={isLit ? "fill-amber-300 font-semibold" : "fill-cyan-300"}>
                        {` [${itemStatus}]`}
                      </tspan>
                    )}
                  </text>
                </g>
              </g>
            );
          })}

          {/* Draw Top-Level Landmarks (if separately registered on page) */}
          {currentPage.landmarks?.map((lm: any, i: number) => {
            if (isEntityHidden(lm.name)) return null;
            const rawLmName = String(lm.name || '').trim();
            const lmNameLower = rawLmName.toLowerCase();
            if (
              !lmNameLower ||
              lmNameLower === 'free hand' ||
              lmNameLower === 'empty hand' ||
              lmNameLower === 'bare hand'
            ) return null;
            if (isPossessionOfAnyone(lm.name)) return null;
            const lx = Number(lm.x) || 0;
            const ly = Number(lm.y) || 0;
            const lName = parseName(lm.name || 'Landmark');
            const lmStatus = lm.status || lm.condition || (Array.isArray(lm.effects) && lm.effects.length > 0 ? lm.effects.join(', ') : '');
            const isBroken = String(lmStatus || '').toLowerCase().includes('broken') || String(lmStatus || '').toLowerCase().includes('ruined') || String(lmStatus || '').toLowerCase().includes('jammed');
            const isLit = String(lmStatus || '').toLowerCase().includes('lit') || String(lmStatus || '').toLowerCase().includes('active');

            return (
              <g key={`page-lm-${i}`} className="group cursor-crosshair">
                <circle
                  cx={lx}
                  cy={ly}
                  r={4}
                  className="fill-indigo-900/80 stroke-indigo-400"
                  strokeWidth={1.5}
                />
                <title>{`${lName}${lmStatus ? ` [${lmStatus}]` : ''} (Landmark: ${lm.description || ''})`}</title>
                <g
                  transform={`translate(${lx}, ${ly}) scale(${textScale})`}
                  className={`pointer-events-auto transition-opacity duration-150 ${
                    showAllLabels ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                  }`}
                >
                  <text
                    x={0}
                    y={-7}
                    textAnchor="middle"
                    dominantBaseline="central"
                    className="fill-indigo-300 text-[5px] font-mono font-bold select-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]"
                    style={{ paintOrder: 'stroke fill', stroke: '#000000', strokeWidth: '2px', strokeLinejoin: 'round' }}
                  >
                    {lName}
                    {lmStatus && (
                      <tspan className={isBroken ? "fill-red-300 italic" : isLit ? "fill-amber-300 font-semibold" : "fill-cyan-300"}>
                        {` [${lmStatus}]`}
                      </tspan>
                    )}
                  </text>
                </g>
              </g>
            );
          })}

          {/* Draw NPCs / Creatures / Entities */}
          {activeNpcs.map((npc: any, i: number) => {
            if (isEntityHidden(npc.name)) return null;
            const nName = parseNpcName(npc.name || 'NPC');
            const cleanName = nName.replace(/-npc$/i, '').trim().toLowerCase();

            // Suppress NPCs that are actually equipped items, gear, or attached things of a player/NPC
            if (
              isPossessionOfAnyone(cleanName) ||
              isPossessionOfAnyone(nName) ||
              isPossessionOfAnyone(npc.name) ||
              npc.attachedTo ||
              npc.isHeld ||
              (npc.holder && npc.holder !== 'ground')
            ) {
              return null;
            }

            // If NPC is attached to a player/NPC (e.g. attached cart, wagon, mount), ensure coordinates track holder!
            let nx = Number(npc.x) || 0;
            let ny = Number(npc.y) || 0;
            const attachedToTarget = String(npc.attachedTo || npc.holder || '').trim().toLowerCase();
            if (attachedToTarget || npc.attachedTo) {
              const matchedHolder = (currentPage.players || []).find((pl: any) => {
                const pUser = String(pl.username || '').toLowerCase();
                const pChar = String(pl.characterName || pl.charName || '').toLowerCase();
                const pEmail = pUser.includes('@') ? pUser.split('@')[0] : '';
                return pUser === attachedToTarget || pChar === attachedToTarget || pEmail === attachedToTarget ||
                       attachedToTarget.includes(pUser) || attachedToTarget.includes(pChar) ||
                       (attachedToTarget === 'player' || attachedToTarget === 'user');
              }) || (currentPage.npcs || []).find((otherNpc: any) => {
                const otherName = String(otherNpc.name || otherNpc.charName || '').toLowerCase().replace(/[-_]npc$/i, '');
                return otherName === attachedToTarget || attachedToTarget.includes(otherName);
              }) || (primaryPlayer ? primaryPlayer : null);

              if (matchedHolder) {
                nx = Number(matchedHolder.x) || 0;
                ny = Number(matchedHolder.y) || 0;
              }
            }
            const nType = npc.type || 'npc';
            const isHostile = /enemy|monster|hostile|boss|bandit/i.test(nType);
            const isAlly = /ally|companion|pet|friend|friendly/i.test(nType);
            const isBoss = /boss/i.test(nType);
            const isBeast = /beast|creature|animal|mount|wolf|horse|dragon|drake/i.test(nType);

            // Fetch NPC sheet content if available to detect conditions/blindness/senses
            const npcFileContent = fileSystem.read(`${nName}.txt`) ||
              fileSystem.read(`${cleanName}-npc.txt`) ||
              fileSystem.read(`${cleanName}.txt`) ||
              fileSystem.read(`${npc.name}.txt`);

            const nFacing = resolveEntityFacing(
              npc,
              primaryPlayer ? { targetX: primaryPlayer.x, targetY: primaryPlayer.y } : undefined
            );

            const nVision = resolveEntityVision(npc, npcFileContent, false);
            const isBlind = nVision.isBlind || nVision.maxRange <= 0;

            const npcHeldItems: HeldItemInfo[] = Array.isArray(npc.heldItems) && npc.heldItems.length > 0
              ? npc.heldItems
              : extractHeldItemsFromCharacterSheet(npcFileContent || '');
            const primaryNpcWeapon = npcHeldItems.find(h => (h.range && h.range > 3) || /rifle|bow|gun|crossbow|wand|staff|spear|sword|dagger/i.test(h.cleanName)) || npcHeldItems[0];
            const npcWeaponRange = primaryNpcWeapon?.range || npc.weaponRange || 0;
            const npcHeldSummary = npcHeldItems.map(h => `${h.cleanName}${h.range ? ` (${h.range}m)` : ''}`).join(', ');

            return (
              <g key={`page-npc-${i}`} className="group cursor-crosshair">
                {/* Attached NPC Weapon Range Circle (Centered on NPC, moves with them) */}
                {npcWeaponRange > 0 && (
                  <circle
                    cx={nx}
                    cy={ny}
                    r={npcWeaponRange}
                    className="fill-red-500/5 stroke-red-400/20 group-hover:stroke-red-400/50 pointer-events-none transition-all duration-300"
                    strokeWidth={0.75}
                    strokeDasharray="2.5 2"
                  />
                )}

                {/* NPC Vision Cones: only drawn if NOT blind and maxRange > 0 */}
                {!isBlind && (
                  <>
                    {/* Peripheral Vision Cone */}
                    <path
                      d={createConePath(nx, ny, nFacing, nVision.peripheralAngle, nVision.maxRange)}
                      className={`${
                        isHostile ? 'fill-red-500/10' :
                        isAlly ? 'fill-emerald-500/10' :
                        isBeast ? 'fill-amber-500/10' :
                        'fill-purple-500/10'
                      } pointer-events-none transition-all duration-300`}
                    />
                    {/* Detailed Vision Cone */}
                    <path
                      d={createConePath(nx, ny, nFacing, nVision.mainAngle, nVision.detailedRange)}
                      className={`${
                        isHostile ? 'fill-red-500/20' :
                        isAlly ? 'fill-emerald-500/20' :
                        isBeast ? 'fill-amber-500/20' :
                        'fill-purple-500/20'
                      } pointer-events-none transition-all duration-300`}
                    />
                  </>
                )}

                {/* NPC Arrow Shape pointing in facing direction */}
                <g transform={`translate(${nx}, ${ny}) rotate(${nFacing})`}>
                  {isBoss && (
                    <polygon
                      points="-6,-5.5 8,0 -6,5.5 -2.5,0"
                      className="fill-red-500/30 animate-ping"
                    />
                  )}
                  <polygon
                    points="-4.5,-4 6,0 -4.5,4 -1.8,0"
                    fill={
                      isHostile ? "#dc2626" :
                      isAlly ? "#059669" :
                      isBoss ? "#e11d48" :
                      isBeast ? "#d97706" :
                      "#7c3aed"
                    }
                    stroke={
                      isHostile ? "#fca5a5" :
                      isAlly ? "#6ee7b7" :
                      isBoss ? "#fde047" :
                      isBeast ? "#fde68a" :
                      "#c4b5fd"
                    }
                    strokeWidth={isBoss ? 1.5 : 0.8}
                    className="drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]"
                  />
                  {/* Center Pivot Dot */}
                  <circle
                    cx={-0.5}
                    cy={0}
                    r={1}
                    fill={isBlind ? "#9ca3af" : "#ffffff"}
                    fillOpacity={0.85}
                  />
                </g>

                <title>{`${nName} (${nType}${isBlind ? ': Blind (No view range)' : ''}${npcHeldSummary ? ` | Holding: ${npcHeldSummary}` : ''}${npc.description ? `: ${npc.description}` : ''})`}</title>
                <g
                  transform={`translate(${nx}, ${ny}) scale(${textScale})`}
                  className={`pointer-events-auto transition-opacity duration-150 ${
                    showAllLabels ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                  }`}
                >
                  <text
                    x={0}
                    y={primaryNpcWeapon ? -9.5 : -7}
                    textAnchor="middle"
                    dominantBaseline="central"
                    className={`${isHostile ? 'fill-red-300' : isAlly ? 'fill-emerald-300' : isBeast ? 'fill-amber-300' : 'fill-purple-300'} text-[5px] font-mono font-bold select-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]`}
                    style={{ paintOrder: 'stroke fill', stroke: '#000000', strokeWidth: '2px', strokeLinejoin: 'round' }}
                  >
                    {nName}{isBlind ? ' [Blind]' : ''}
                  </text>
                  {primaryNpcWeapon && (
                    <text
                      x={0}
                      y={-4.5}
                      textAnchor="middle"
                      dominantBaseline="central"
                      className="fill-amber-300 text-[3.8px] font-mono font-medium select-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]"
                      style={{ paintOrder: 'stroke fill', stroke: '#000000', strokeWidth: '1.5px', strokeLinejoin: 'round' }}
                    >
                      {`[${primaryNpcWeapon.cleanName}${primaryNpcWeapon.range ? ` • ${primaryNpcWeapon.range}m` : ''}]`}
                    </text>
                  )}
                </g>
              </g>
            );
          })}

          {/* Draw Players */}
          {currentPage.players?.map((player: any, i: number) => {
            const px = Number(player.x) || 0;
            const py = Number(player.y) || 0;
            const pfacing = resolveEntityFacing(player);
            const res = resolvePlayerIdentity(player, playerRegistry);
            const isMe = res.canonicalKey === String(username).toLowerCase();
            const displayName = res.characterName && res.characterName !== res.username
              ? `${res.characterName} (${res.username})`
              : res.characterName || res.username;

            // Fetch player character sheet to detect conditions/blindness/senses
            const pFileContent = fileSystem.read(`${res.characterName}-${res.username}.txt`) ||
              fileSystem.read(`${res.characterName}.txt`) ||
              fileSystem.read(`${res.username}.txt`);

            const pVision = resolveEntityVision(player, pFileContent, true);
            const isBlind = pVision.isBlind || pVision.maxRange <= 0;

            const heldItems: HeldItemInfo[] = Array.isArray(player.heldItems) && player.heldItems.length > 0
              ? player.heldItems
              : extractHeldItemsFromCharacterSheet(pFileContent || '');
            const primaryWeapon = heldItems.find(h => (h.range && h.range > 3) || /rifle|bow|gun|crossbow|wand|staff|spear|sword|dagger/i.test(h.cleanName)) || heldItems[0];
            const weaponRange = primaryWeapon?.range || player.weaponRange || 0;
            const heldSummary = heldItems.map(h => `${h.cleanName}${h.range ? ` (${h.range}m)` : ''}`).join(', ');

            return (
              <g key={res.canonicalKey || player.username || i} className="group cursor-pointer">
                {/* Attached Weapon Range Circle (Centered on Player, moves with them) */}
                {weaponRange > 0 && (
                  <circle
                    cx={px}
                    cy={py}
                    r={weaponRange}
                    className="fill-blue-500/5 stroke-blue-400/25 group-hover:stroke-blue-400/60 pointer-events-none transition-all duration-300"
                    strokeWidth={0.75}
                    strokeDasharray="2.5 2"
                  />
                )}

                {/* Vision Cones: only drawn if NOT blind and maxRange > 0 */}
                {!isBlind && (
                  <>
                    {/* Max Range (Peripheral) */}
                    <path
                      d={createConePath(px, py, pfacing, pVision.peripheralAngle, pVision.maxRange)}
                      className="fill-white/5 pointer-events-none"
                    />
                    {/* Detailed Range (Main) */}
                    <path
                      d={createConePath(px, py, pfacing, pVision.mainAngle, pVision.detailedRange)}
                      className="fill-white/10 pointer-events-none"
                    />
                  </>
                )}

                {/* Player Triangle */}
                <polygon
                  points="-4,-4 6,0 -4,4"
                  fill={isMe ? "#3b82f6" : "#ef4444"}
                  stroke={isMe ? "#93c5fd" : "#fca5a5"}
                  strokeWidth={0.8}
                  transform={`translate(${px}, ${py}) rotate(${pfacing})`}
                />
                <title>{`${displayName}${isBlind ? ' (Blind - No view range)' : ''}${heldSummary ? ` | Holding: ${heldSummary}` : ''}`}</title>
                <g
                  transform={`translate(${px}, ${py}) scale(${textScale})`}
                  className={`pointer-events-auto transition-opacity duration-150 ${
                    showAllLabels ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                  }`}
                >
                  <text
                    x={0}
                    y={primaryWeapon ? -10 : -8}
                    textAnchor="middle"
                    dominantBaseline="central"
                    className="fill-white text-[5.5px] font-mono font-bold select-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]"
                    style={{ paintOrder: 'stroke fill', stroke: '#000000', strokeWidth: '2px', strokeLinejoin: 'round' }}
                  >
                    {displayName}{isBlind ? ' [Blind]' : ''}
                  </text>
                  {primaryWeapon && (
                    <text
                      x={0}
                      y={-4.5}
                      textAnchor="middle"
                      dominantBaseline="central"
                      className="fill-amber-300 text-[4px] font-mono font-medium select-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]"
                      style={{ paintOrder: 'stroke fill', stroke: '#000000', strokeWidth: '1.5px', strokeLinejoin: 'round' }}
                    >
                      {`[${primaryWeapon.cleanName}${primaryWeapon.range ? ` • ${primaryWeapon.range}m` : ''}]`}
                    </text>
                  )}
                </g>
              </g>
            );
          })}

          {/* Draw Notes/Annotations */}
          {currentPage.notes?.map((note: any, i: number) => {
            const nx = Number(note.x) || 0;
            const ny = Number(note.y) || 0;
            const isDanger = note.type === 'danger';
            const isDiscovery = note.type === 'discovery';

            return (
              <g key={`note-${i}`} transform={`translate(${nx}, ${ny})`} className="group cursor-pointer">
                {/* Invisible larger hit circle for comfortable hover */}
                <circle r={4} className="fill-transparent" />
                <circle r={1.5} className={isDanger ? "fill-red-500" : isDiscovery ? "fill-yellow-400" : "fill-blue-400"} />
                <g
                  transform={`scale(${textScale})`}
                  className={`pointer-events-auto transition-opacity duration-150 ${
                    showAllLabels ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                  }`}
                >
                  <text
                    x={0}
                    y={-5}
                    textAnchor="middle"
                    dominantBaseline="central"
                    className={`text-[4.5px] font-bold font-mono select-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)] ${
                      isDanger ? "fill-red-400" : isDiscovery ? "fill-yellow-300" : "fill-blue-300"
                    }`}
                    style={{ paintOrder: 'stroke fill', stroke: '#000000', strokeWidth: '2px', strokeLinejoin: 'round' }}
                  >
                    {note.text}
                  </text>
                </g>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
});

export default React.memo(MapPanel);
