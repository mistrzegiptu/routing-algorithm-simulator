from pydantic import BaseModel, field_validator, Field, IPvAnyAddress
from typing import Optional, List
import ipaddress
from .route_entry import RouteType

DEVICE_TYPES = {"router", "computer"}


class DeviceCreateRequest(BaseModel):
    name: Optional[str] = None
    port_number: Optional[int] = None
    type: str = "router"

    @field_validator('name', mode='before')
    @classmethod
    def empty_str_to_none(cls, v):
        if v == "":
            return None
        return v

    @field_validator('type')
    @classmethod
    def validate_type(cls, v):
        if v not in DEVICE_TYPES:
            raise ValueError(f"Device type must be one of {sorted(DEVICE_TYPES)}")
        return v


class PortSchema(BaseModel):
    ip: str
    mask: int

    @field_validator('ip')
    @classmethod
    def validate_ip(cls, v):
        try:
            ipaddress.IPv4Address(v)
        except ValueError:
            raise ValueError('Invalid IPv4 address format')
        return v

    @field_validator('mask')
    @classmethod
    def validate_mask(cls, v):
        if not (0 <= v <= 32):
            raise ValueError('IPv4 subnet mask must be between 0 and 32')
        return v


class DeviceUpdateRequest(BaseModel):
    name: Optional[str] = None
    ports: Optional[List[PortSchema]] = None


class CreateLinkRequest(BaseModel):
    device_a_id: int
    device_b_id: int
    # Interfaces are allocated automatically when omitted (Option A port model).
    port_a_num: Optional[int] = None
    port_b_num: Optional[int] = None
      
    bandwidth: Optional[int] = None
    delay: int = 10
    unit: str = "Mbps"

class RouteCreateRequest(BaseModel):
    dest: str
    mask: int = Field(ge=0, le=32)
    next_hop: str
    entry_type: RouteType = "static"

    @field_validator('dest', 'next_hop')
    @classmethod
    def validate_ip(cls, v):
        try:
            ipaddress.IPv4Address(v)
        except ValueError:
            raise ValueError('Invalid IPv4 address format')
        return v

class RouteDeleteRequest(BaseModel):
    dest: str
    mask: int = Field(ge=0, le=32)

    @field_validator('dest')
    @classmethod
    def validate_ip(cls, v):
        try:
            ipaddress.IPv4Address(v)
        except ValueError:
            raise ValueError('Invalid IPv4 address format')
        return v