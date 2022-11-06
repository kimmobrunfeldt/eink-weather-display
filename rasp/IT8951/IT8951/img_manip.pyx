# cython: language_level=3
# cython: profile=True

'''
This file contains functions for efficiently manipulating image data, in ways that
aren't directly achievable in Python with Pillow.
'''

cimport cython

@cython.boundscheck(False)
def make_changes_bw(prev_frame, new_frame):
    '''
    Take any pixels that have changed and map them from grayscale to black/white.
    '''

    if prev_frame.size != new_frame.size:
        raise ValueError('dimensions of images do not match')

    if any(x.mode != "L" for x in (prev_frame, new_frame)):
        raise ValueError('image mode must be "L"')

    # we only need read access to this one, so might as well do it the legit way
    cdef const unsigned char [:] prev_buf = prev_frame.tobytes()

    # get raw pointers to the pillow data of new_frame
    # is this hacky? ... yes. but it doesn't seem possible otherwise
    # see: https://github.com/python-pillow/Pillow/issues/1112
    cdef long new_ptr = dict(new_frame.im.unsafe_ptrs)['image8']
    cdef unsigned char* new_buf = (<unsigned char**>new_ptr)[0]

    cdef int i
    for i in range(len(prev_buf)):
        if prev_buf[i] != new_buf[i]:
            new_buf[i] = 0xF0 if new_buf[i] > 0xB0 else 0x00
