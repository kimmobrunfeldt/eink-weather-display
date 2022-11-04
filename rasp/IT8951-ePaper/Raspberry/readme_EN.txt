/*****************************************************************************
* | File      	:   Readme_EN.txt
* | Author      :   Waveshare team
* | Function    :   Help with use
* | Info        :
*----------------
* |	This version:   V1.0
* | Date        :   2020-08-25
* | Info        :   Here is an English version of the documentation for your quick use.
******************************************************************************/
This document is to help you use this routine.
For ease of maintenance and development, we have integrated all the parallel epd Raspberry Pie example programs into this project.
Here is a brief description of the use of this project.

1. Basic information:
This routine is verified using the driver module that comes with the epd, 
and you can view some test functions in the project examples/;


2. Basic use:
As this project is a comprehensive project, for use, you may need to read the following.
Go to the project main directory and type: sudo make 
compiles the program and generates an executable file: epd
If you change the program, you need to type: sudo make clear, then retype: sudo make.
Note which type of ink screen you purchased. Observe the VCOM value on the FPC line, and know the display mode of the ink screen.
example 1:
    If you purchased a 10.3inch e-Paper HAT and check the VCOM on the FPC is -1.52 (each screen may be different, see what happens),
	And that screen is mode 1, then enter:
        sudo ./epd -1.52 1
example 2:
    If you purchased a 13.3inch e-Paper HAT and check the VCOM on the FPC is -2.54 (each screen may be different, see what happens),
	And that screen is mode 0, then enter:
		sudo ./epd -2.54 0


3. Model description:
Since the coordinate origin and display orientation are different for different ink screens, 
And the driver board firmware is not easy to modify, we provide an input parameter to modify the display mode.
Of course you can view and add new modes in example.c

Existing mode:
	mode 0		No rotate, No mirroring		Default mode, mode 0 without special instructions
	mode 1		No rotate, X mirroring		10.3inch e-Paper HAT
	mode 2		No rotate, X mirroring		5.2inch e-Paper IT8951 Drever HAT
	mode 3		No rotate, No mirroring, isColor	6inch e-Paper Color


4. Directory structure (selection):
If you use our products frequently, we will be very familiar with our program directory structure. We have a copy of the specific function.
The API manual for the function, you can download it on our WIKI or request it as an after-sales customer service. Here is a brief introduction:
Config\: This directory is a hardware interface layer file. You can see many definitions in DEV_Config.c(.h), including:
   type of data;
    GPIO;
    Read and write GPIO;
    Delay: Note: This delay function does not use an oscilloscope to measure specific values.
    Module Init and exit processing:
        void DEV_Module_Init(void);
        void DEV_Module_Exit(void);
        Note: 1. Here is the processing of some GPIOs before and after using the ink screen.
             
\lib\GUI\: This directory is some basic image processing functions, in GUI_Paint.c(.h):
    Common image processing: creating graphics, flipping graphics, mirroring graphics, setting pixels, clearing screens, etc.
    Common drawing processing: drawing points, lines, boxes, circles, Chinese characters, English characters, numbers, etc.;
    Common time display: Provide a common display time function;
    Commonly used display pictures: provide a function to display bitmaps;
    
\lib\Fonts\: for some commonly used fonts:
    Ascii:
        Font8: 5*8
        Font12: 7*12
        Font16: 11*16
        Font20: 14*20
        Font24: 17*24
    Chinese:
        font12CN: 16*21
        font24CN: 32*41
        
\lib\E-paper\: This screen is the ink screen driver function;