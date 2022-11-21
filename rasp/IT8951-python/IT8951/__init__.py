
# check python version
from sys import version_info
if version_info[0] != 3:
    raise RuntimeError("Run this code using Python 3.")
