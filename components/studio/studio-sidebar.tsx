import { Filter, Heart, LayoutGrid, List, Search } from "lucide-react";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export default function StudioSidebar() {
    const [isExpanded, setIsExpanded] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const [selectedView, setSelectedView] = useState<"grid" | "list">("grid");

    const toggleSearch = () => {
        setIsExpanded((prev) => !prev);
    };

    useEffect(() => {
        if (isExpanded && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isExpanded]);

    return (
        <div>
            <div className="sidebar space-y-4">
                <div className="sidebar-header flex justify-between">
                    <div>
                        <span>Daltex Resign Bound</span>
                    </div>
                    <div>
                        <Heart />
                    </div>
                </div>
                <div className="">
                    <div className="sidebar-filters flex">
                        <div className="flex gap-2">
                            <Button
                                className={"shrink-0 z-10 text-muted-foreground hover:text-foreground border border-border"}
                                variant={"ghost"}
                                size={"icon"}
                                aria-label="Toggle Search"
                                onClick={toggleSearch}
                            >
                                <Search />
                            </Button>
                            <div className={cn(
                                `overflow-hidden transition-all duration-300 ease-in-out`,
                                isExpanded ? "w-48 sm:w-64 opacity-100 ml-2" : "w-0 opacity-0 ml-0"
                            )} >
                                <Input
                                    ref={inputRef}
                                    className="w-full"
                                    placeholder="Search..."
                                />
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <div>
                                <Button className={"px-4 w-40"}>
                                    <span>
                                        <Filter />
                                    </span>
                                    <span>Filter</span>
                                </Button>
                            </div>
                            <div className="flex items-center gap-2">
                                <Button
                                    variant={selectedView === "list" ? "default" : "outline"}
                                    onClick={() => setSelectedView("list")}
                                    size={"icon"}
                                    aria-label="Switch to list view"
                                >
                                    <span><List /> </span>
                                </Button>
                                <Button
                                    variant={selectedView === "grid" ? "default" : "outline"}
                                    onClick={() => setSelectedView("grid")}
                                    size={"icon"}
                                    aria-label="Switch to grid view"
                                >
                                    <span> <LayoutGrid /></span>
                                </Button>
                            </div>
                        </div>
                    </div>
                    <div className="sidebar-products"></div>
                </div>
            </div>
        </div>
    );
}
