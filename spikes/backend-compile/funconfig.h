// ch32v003fun expects a per-project funconfig.h. For the J4M6 baseline
// we only need to assert the chip family — defaults take care of the
// clock setup (HSI 24 MHz / HPRE 3 = 8 MHz HCLK) and runtime options.
#ifndef _FUNCONFIG_H
#define _FUNCONFIG_H
#define CH32V003 1
#endif
