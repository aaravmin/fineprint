"use client";

import type React from "react";
import { Children, isValidElement } from "react";

import { cn } from "@/lib/utils";

interface StickyTabItemProps {
  title: string;
  id: string | number;
  children: React.ReactNode;
}

const StickyTabItem: React.FC<StickyTabItemProps> = () => {
  return null;
};

interface StickyTabsProps {
  children: React.ReactNode;
  mainNavHeight?: string;
  rootClassName?: string;
  sectionClassName?: string;
  stickyHeaderContainerClassName?: string;
  headerContentWrapperClassName?: string;
  headerContentLayoutClassName?: string;
  titleClassName?: string;
  contentLayoutClassName?: string;
}

const StickyTabs: React.FC<StickyTabsProps> & {
  Item: React.FC<StickyTabItemProps>;
} = ({
  children,
  // Matches the h-16 landing nav so section headers dock right under it.
  mainNavHeight = "4rem",
  rootClassName = "bg-background text-foreground",
  sectionClassName = "bg-background",
  stickyHeaderContainerClassName = "",
  headerContentWrapperClassName = "border-b border-t border-border bg-background/95 backdrop-blur-md",
  headerContentLayoutClassName = "mx-auto max-w-6xl px-5 py-4",
  titleClassName = "font-heading my-0 text-xl font-bold tracking-tight md:text-2xl",
  contentLayoutClassName = "mx-auto max-w-6xl px-5 py-20 md:py-24",
}) => {
  const stickyTopValue = `calc(${mainNavHeight} - 1px)`;
  const stickyHeaderStyle = { top: stickyTopValue };

  return (
    <div className={cn("overflow-clip", rootClassName)}>
      {Children.map(children, child => {
        if (!isValidElement(child) || child.type !== StickyTabItem) {
          return null;
        }

        const itemElement = child as React.ReactElement<StickyTabItemProps>;
        const { title, id, children: itemContent } = itemElement.props;

        return (
          <section key={id} className={cn("relative overflow-clip", sectionClassName)}>
            <div
              className={cn(
                "sticky z-10 -mt-px flex flex-col",
                stickyHeaderContainerClassName,
              )}
              style={stickyHeaderStyle}
            >
              <div className={headerContentWrapperClassName}>
                <div className={headerContentLayoutClassName}>
                  <div className="flex items-center justify-between">
                    <h2 className={titleClassName}>{title}</h2>
                  </div>
                </div>
              </div>
            </div>

            <div className={contentLayoutClassName}>{itemContent}</div>
          </section>
        );
      })}
    </div>
  );
};

StickyTabs.Item = StickyTabItem;

export default StickyTabs;
