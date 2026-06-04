// Minimal blink for the compile spike. Mirrors the L03 lesson pattern:
// register-level GPIO setup, no framework helpers, hardware-portable
// busy-wait via `volatile int i`.

#include "ch32v003fun.h"

int main(void) {
    SystemInit();

    // Enable GPIOC clock
    RCC->APB2PCENR |= RCC_APB2Periph_GPIOC;

    // PC1 = push-pull output, 50 MHz
    GPIOC->CFGLR &= ~(0xF << (4 * 1));
    GPIOC->CFGLR |=  (0x3 << (4 * 1));

    while (1) {
        GPIOC->BSHR = (1 << 1);
        for (volatile int i = 0; i < 500000; i++) {}
        GPIOC->BCR  = (1 << 1);
        for (volatile int i = 0; i < 500000; i++) {}
    }
}
