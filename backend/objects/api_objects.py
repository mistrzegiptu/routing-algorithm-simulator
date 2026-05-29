from pydantic import BaseModel, validator
from typing import Optional, List
import ipaddress

class RouterCreateRequest(BaseModel):
    name: Optional[str] = None
    port_number: Optional[int] = None

    @validator('name', pre=True, always=True)
    def empty_str_to_none(cls, v):
        if v == "":
            return None
        return v
    
class PortSchema(BaseModel):
    ip: str
    mask: int

    @validator('ip')
    def validate_ip(cls, v):
        try:
            ipaddress.IPv4Address(v)
        except ValueError:
            raise ValueError('Invalid IPv4 address format')
        return v

    @validator('mask')
    def validate_mask(cls, v):
        if not (0 <= v <= 32):
            raise ValueError('IPv4 subnet mask must be between 0 and 32')
        return v
        

class RouterUpdateRequest(BaseModel):
    name: Optional[str] = None
    ports: Optional[List[PortSchema]] = None